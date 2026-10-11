import {
	CACHE_MAX_AGE,
	CORS_ORIGIN,
	EXTRA_SOURCES,
	FETCH_OPTIONS,
} from "../src/config";
import { loadFriendSources } from "../src/friends-config";
import { fetchAll, type FeedSource } from "../src/rss";

type Env = unknown;

// Cloudflare Pages Functions 入口：/circle.json
// 在边缘节点抓取友链 RSS，结果写入边缘缓存，供博客直接读取
export async function onRequest(context: {
	request: Request;
	env: Env;
	waitUntil: (promise: Promise<unknown>) => void;
}): Promise<Response> {
	const { request, waitUntil } = context;
	const corsHeaders = {
		"Access-Control-Allow-Origin": CORS_ORIGIN,
		"Access-Control-Allow-Methods": "GET, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
	};

	// 预检请求
	if (request.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: corsHeaders });
	}

	if (request.method !== "GET") {
		return json({ error: "Method Not Allowed" }, 405, corsHeaders);
	}

	// 先查边缘缓存，命中则直接返回，不再抓取
	const cache = (caches as CacheStorage).default;
	const cacheKey = new Request(request.url, { method: "GET" });
	const cached = await cache.match(cacheKey);
	if (cached) {
		const headers = new Headers(cached.headers);
		Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v));
		headers.set("X-Circle-Cache", "HIT");
		return new Response(cached.body, { status: 200, headers });
	}

	// 未命中：抓取
	const { sources: friendSources, error: configError } = await loadFriendSources(
		FETCH_OPTIONS.timeout,
	);

	// 合并去重，额外配置优先
	const merged: FeedSource[] = [];
	for (const source of friendSources) {
		if (!EXTRA_SOURCES.some((s) => s.name === source.name)) merged.push(source);
	}
	merged.push(...EXTRA_SOURCES);

	if (merged.length === 0) {
		return json(
			{ error: "没有可用的订阅源", detail: configError ?? "" },
			200,
			corsHeaders,
		);
	}

	const result = await fetchAll(merged, {
		timeout: FETCH_OPTIONS.timeout,
		limitPerSource: FETCH_OPTIONS.limitPerSource,
		totalLimit: FETCH_OPTIONS.totalLimit,
	});

	const payload = {
		updatedAt: new Date().toISOString(),
		sourceCount: result.sources.length,
		sources: result.sources,
		items: result.items,
		failures: result.failures,
	};

	const response = json(payload, 200, {
		...corsHeaders,
		"Cache-Control": `public, max-age=${CACHE_MAX_AGE}`,
		"X-Circle-Cache": "MISS",
	});

	// 写入边缘缓存，供后续请求复用
	waitUntil(cache.put(cacheKey, response.clone()));

	return response;
}

function json(data: unknown, status: number, headers: Record<string, string>): Response {
	return new Response(JSON.stringify(data, null, 2), {
		status,
		headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
	});
}
