// RSS / Atom 解析与抓取
// 只使用 Web 标准 API（fetch / AbortController），可在 Cloudflare Workers 运行时中执行

export type FeedSource = {
	name: string; // 站点名称
	site: string; // 站点主页
	avatar?: string; // 头像地址
	feed?: string; // 订阅源地址，留空则自动探测
};

export type FeedItem = {
	title: string;
	link: string;
	published: string;
	timestamp: number;
	sourceName: string;
	sourceAvatar?: string;
	sourceSite: string;
};

export type FetchOutcome = {
	source: FeedSource;
	items: FeedItem[];
	feedUrl?: string;
	error?: string;
};

const UA = "Mozilla/5.0 (compatible; CircleFeed/1.0; +https://github.com/xingmihai/circle-feed)";

// 常见的订阅源路径，用于自动探测
const COMMON_FEED_PATHS = [
	"/rss.xml",
	"/atom.xml",
	"/feed",
	"/feed.xml",
	"/index.xml",
	"/rss/",
	"/feed/rss.xml",
];

// ------------------------------------------------------------------ 解析

function pickTag(xml: string, tag: string): string {
	const cdata = new RegExp(
		`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`,
		"i",
	).exec(xml);
	if (cdata) return cdata[1].trim();

	const plain = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
	return plain ? plain[1].trim() : "";
}

function pickLink(xml: string, isAtom: boolean): string {
	if (isAtom) {
		const alternate =
			/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i.exec(xml);
		if (alternate) return alternate[1].trim();
		const anyHref = /<link[^>]*href=["']([^"']+)["']/i.exec(xml);
		return anyHref ? anyHref[1].trim() : "";
	}
	return pickTag(xml, "link");
}

function decodeEntities(text: string): string {
	return text
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&");
}

function normalizeText(text: string): string {
	return decodeEntities(text.replace(/<[^>]+>/g, ""))
		.replace(/\s+/g, " ")
		.trim();
}

function parseTimestamp(raw: string): number {
	if (!raw) return 0;
	const ts = Date.parse(raw);
	return Number.isNaN(ts) ? 0 : ts;
}

export type RawItem = {
	title: string;
	link: string;
	published: string;
	timestamp: number;
};

// 解析 RSS 2.0 / Atom
export function parseFeed(xml: string): RawItem[] {
	if (!xml) return [];
	const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
	const tagName = isAtom ? "entry" : "item";
	const blocks =
		xml.match(new RegExp(`<${tagName}[\\s>][\\s\\S]*?</${tagName}>`, "gi")) || [];

	const items: RawItem[] = [];
	for (const block of blocks) {
		const title = normalizeText(pickTag(block, "title"));
		const link = pickLink(block, isAtom);
		if (!title || !link) continue;
		const published =
			pickTag(block, "pubDate") ||
			pickTag(block, "published") ||
			pickTag(block, "updated") ||
			pickTag(block, "dc:date");
		items.push({ title, link, published, timestamp: parseTimestamp(published) });
	}
	return items;
}

// ------------------------------------------------------------------ 抓取

async function fetchText(
	url: string,
	timeout: number,
): Promise<{ text: string; error?: string }> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);
	try {
		const res = await fetch(url, {
			signal: controller.signal,
			headers: {
				"User-Agent": UA,
				Accept:
					"application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
			},
		});
		if (!res.ok) return { text: "", error: `HTTP ${res.status}` };
		return { text: await res.text() };
	} catch (err) {
		const reason =
			err instanceof Error
				? err.name === "AbortError"
					? "抓取超时"
					: err.message
				: "抓取失败";
		return { text: "", error: reason };
	} finally {
		clearTimeout(timer);
	}
}

// 自动探测站点常见的订阅源路径
export async function discoverFeed(
	site: string,
	timeout: number,
): Promise<string | null> {
	const base = site.replace(/\/+$/, "");
	for (const path of COMMON_FEED_PATHS) {
		const url = base + path;
		const { text, error } = await fetchText(url, timeout);
		if (error) continue;
		if (!/<rss[\s>]/i.test(text) && !/<feed[\s>]/i.test(text)) continue;
		if (parseFeed(text).length > 0) return url;
	}
	return null;
}

// 抓取单个订阅源：优先用配置地址，失败再自动探测
export async function fetchSource(
	source: FeedSource,
	timeout: number,
	limit: number,
): Promise<FetchOutcome> {
	const candidates = source.feed ? [source.feed] : [];
	let lastError = source.feed ? "抓取失败" : "未配置订阅源地址";

	for (const url of candidates) {
		const { text, error } = await fetchText(url, timeout);
		if (error) {
			lastError = error;
			continue;
		}
		const parsed = parseFeed(text);
		if (parsed.length > 0) {
			return {
				source,
				feedUrl: url,
				items: parsed.slice(0, limit).map((item) => ({
					...item,
					sourceName: source.name,
					sourceAvatar: source.avatar,
					sourceSite: source.site,
				})),
			};
		}
		lastError = "未解析到文章";
	}

	const discovered = await discoverFeed(source.site, Math.min(timeout, 5000));
	if (discovered) {
		const { text, error } = await fetchText(discovered, timeout);
		if (!error) {
			const parsed = parseFeed(text);
			if (parsed.length > 0) {
				return {
					source,
					feedUrl: discovered,
					items: parsed.slice(0, limit).map((item) => ({
						...item,
						sourceName: source.name,
						sourceAvatar: source.avatar,
						sourceSite: source.site,
					})),
				};
			}
		}
		return { source, items: [], error: "已找到订阅源但解析不出文章" };
	}

	return {
		source,
		items: [],
		error: source.feed ? lastError : "未探测到订阅源（可手动填写 feed 地址）",
	};
}

// 并发抓取所有订阅源
export async function fetchAll(
	sources: FeedSource[],
	options: { timeout: number; limitPerSource: number; totalLimit: number },
): Promise<{
	items: FeedItem[];
	sources: { name: string; site: string; avatar?: string; feedUrl?: string; ok: boolean }[];
	failures: { name: string; error: string }[];
}> {
	const outcomes = await Promise.all(
		sources.map((source) =>
			fetchSource(source, options.timeout, options.limitPerSource),
		),
	);

	const items: FeedItem[] = [];
	const failures: { name: string; error: string }[] = [];
	const sourceMeta: {
		name: string;
		site: string;
		avatar?: string;
		feedUrl?: string;
		ok: boolean;
	}[] = [];

	for (const outcome of outcomes) {
		if (outcome.error) {
			failures.push({ name: outcome.source.name, error: outcome.error });
		} else {
			items.push(...outcome.items);
		}
		sourceMeta.push({
			name: outcome.source.name,
			site: outcome.source.site,
			avatar: outcome.source.avatar,
			feedUrl: outcome.feedUrl,
			ok: !outcome.error,
		});
	}

	items.sort((a, b) => b.timestamp - a.timestamp);

	return {
		items: items.slice(0, options.totalLimit),
		sources: sourceMeta,
		failures,
	};
}
