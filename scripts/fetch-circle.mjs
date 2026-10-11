#!/usr/bin/env node
// 圈子数据抓取脚本
//
// 纯 Node 实现，零依赖，由 GitHub Actions 定时执行
// 从主仓库的友链配置读取订阅源，抓取 RSS / Atom，生成 public/circle.json
//
// 用法：node scripts/fetch-circle.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = resolve(ROOT, "public/circle.json");

const UA =
	"Mozilla/5.0 (compatible; CircleFeed/1.0; +https://github.com/xingmihai/circle-feed)";

// 兜底的常见订阅源路径，用于自动探测
// 正常情况下以 src/config.ts 中的 COMMON_FEED_PATHS 为准
const DEFAULT_FEED_PATHS = [
	// 通用
	"/rss.xml",
	"/atom.xml",
	"/feed",
	"/feed.xml",
	"/index.xml",
	"/rss/",
	"/feed/rss.xml",
	// Typecho 常用（带斜杠结尾，与 /feed 并不等价）
	"/feed/",
	"/feed/index.xml",
	"/rss.php",
	"/index.php/feed/",
	"/index.php/feed",
	// WordPress 常用
	"/?feed=rss2",
	"/feed?type=rss2",
	// Hugo / Astro 等静态站
	"/blog/index.xml",
	"/posts/index.xml",
];

// 兜底默认值：src/config.ts 读取失败时使用
// 正常情况下以 src/config.ts 中的配置为准
const DEFAULT_FRIENDS_CONFIG_URLS = [
	// raw 无缓存，改友链后立即生效
	"https://raw.githubusercontent.com/xingmihai/XMHAI/master/src/config/friendsConfig.ts",
	// 备用：jsDelivr CDN
	"https://cdn.jsdelivr.net/gh/xingmihai/XMHAI@master/src/config/friendsConfig.ts",
];
const DEFAULT_OPTIONS = {
	timeout: 10000,
	limitPerSource: 5,
	totalLimit: 40,
};

// ---------------------------------------------------------------- 配置解析

// 去掉整行注释，避免被注释掉的示例配置被当成真实订阅源
function stripCommentLines(source) {
	return source
		.split("\n")
		.filter((line) => !/^\s*\/\//.test(line))
		.join("\n");
}

// 截取 `export const xxx = {...}` 对象内部的内容
// FETCH_OPTIONS 是对象而非数组，不能复用 sliceArrayBody
function sliceObjectBody(source, anchor) {
	const start = source.indexOf(anchor);
	if (start < 0) return "";
	const matched = /[=:]\s*\{/.exec(source.slice(start));
	if (!matched) return "";
	const open = start + matched.index + matched[0].length - 1;

	let depth = 0;
	for (let i = open; i < source.length; i++) {
		const ch = source[i];
		if (ch === "{") depth++;
		else if (ch === "}") {
			depth--;
			if (depth === 0) return source.slice(open + 1, i);
		}
	}
	return "";
}

// 截取 `export const friendsConfig = [...]` 数组内部的内容
// 用 `[=:] [` 定位数组起点，避开 `FriendLink[]` 这类类型注解里的方括号
function sliceArrayBody(source, anchor) {
	const start = source.indexOf(anchor);
	if (start < 0) return "";
	const matched = /[=:]\s*\[/.exec(source.slice(start));
	if (!matched) return "";
	const open = start + matched.index + matched[0].length - 1;

	let depth = 0;
	for (let i = open; i < source.length; i++) {
		const ch = source[i];
		if (ch === "[") depth++;
		else if (ch === "]") {
			depth--;
			if (depth === 0) return source.slice(open + 1, i);
		}
	}
	return "";
}

// 按顶层大括号切分对象块
function splitObjects(body) {
	const blocks = [];
	let depth = 0;
	let start = -1;
	for (let i = 0; i < body.length; i++) {
		const ch = body[i];
		if (ch === "{") {
			if (depth === 0) start = i;
			depth++;
		} else if (ch === "}") {
			depth--;
			if (depth === 0 && start >= 0) {
				blocks.push(body.slice(start, i + 1));
				start = -1;
			}
		}
	}
	return blocks;
}

function pickField(block, key) {
	const matched = new RegExp(`${key}\\s*:\\s*"([^"]*)"`, "i").exec(block);
	return matched ? matched[1] : undefined;
}

function pickBoolean(block, key, fallback = true) {
	const matched = new RegExp(`${key}\\s*:\\s*(true|false)`, "i").exec(block);
	return matched ? matched[1] === "true" : fallback;
}

// 提取字符串数组的内容（如 FRIENDS_CONFIG_URLS）
function sliceStringArray(source, anchor) {
	const body = sliceArrayBody(source, anchor);
	return (body.match(/"[^"]*"/g) || []).map((s) => s.slice(1, -1));
}

// 提取数字字段，取不到则用兜底值
function pickNumber(source, key, fallback) {
	const matched = new RegExp(`${key}\\s*:\\s*(\\d+)`, "i").exec(source);
	return matched ? Number(matched[1]) : fallback;
}

// 读取本地配置（src/config.ts）：额外订阅源、主仓库地址、抓取参数
// 读取失败时降级为默认值，保证脚本始终可运行
function loadLocalConfig() {
	let source;
	try {
		source = stripCommentLines(
			readFileSync(resolve(ROOT, "src/config.ts"), "utf-8"),
		);
	} catch {
		source = "";
	}

	const extraSources = sliceArrayBody(source, "export const EXTRA_SOURCES")
		? splitObjects(sliceArrayBody(source, "export const EXTRA_SOURCES"))
				.filter((block) => pickBoolean(block, "enabled", true))
				.map((block) => ({
					name: pickField(block, "name") || "",
					site: pickField(block, "site") || "",
					avatar: pickField(block, "avatar") || undefined,
					feed: pickField(block, "feed") || undefined,
				}))
				.filter((item) => item.name && item.site)
		: [];

	const friendUrls = sliceStringArray(source, "export const FRIENDS_CONFIG_URLS");
	const optionsBlock = sliceObjectBody(source, "export const FETCH_OPTIONS");

	// 不参与订阅的站点（按名称匹配）：例如备案展示页、导航站这类本来就没有 RSS 的友链
	const excluded = sliceStringArray(source, "export const EXCLUDED_SITES");

	// 自动探测时依次尝试的路径
	const feedPaths = sliceStringArray(source, "export const COMMON_FEED_PATHS");

	return {
		extraSources,
		excluded,
		feedPaths: feedPaths.length ? feedPaths : DEFAULT_FEED_PATHS,
		friendUrls: friendUrls.length ? friendUrls : DEFAULT_FRIENDS_CONFIG_URLS,
		options: {
			timeout: pickNumber(optionsBlock, "timeout", DEFAULT_OPTIONS.timeout),
			limitPerSource: pickNumber(
				optionsBlock,
				"limitPerSource",
				DEFAULT_OPTIONS.limitPerSource,
			),
			totalLimit: pickNumber(
				optionsBlock,
				"totalLimit",
				DEFAULT_OPTIONS.totalLimit,
			),
		},
	};
}

// 从主仓库拉取友链配置并解析
async function loadFriendSources(timeout, urls) {
	for (const url of urls) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeout);
		try {
			const res = await fetch(url, {
				signal: controller.signal,
				headers: { "User-Agent": UA },
			});
			if (!res.ok) continue;
			const text = await res.text();
			const body = sliceArrayBody(stripCommentLines(text), "export const friendsConfig");
			const sources = splitObjects(body)
				.filter((block) => pickBoolean(block, "enabled", true))
				.map((block) => ({
					name: pickField(block, "title") || "",
					site: pickField(block, "siteurl") || "",
					avatar: pickField(block, "imgurl") || undefined,
					feed: pickField(block, "rss") || undefined,
				}))
				.filter((item) => item.name && item.site);
			if (sources.length > 0) return { sources, url };
		} catch {
			// 换下一个地址继续尝试
		} finally {
			clearTimeout(timer);
		}
	}
	return { sources: [], error: "未能读取主仓库的友链配置" };
}

// ---------------------------------------------------------------- 解析

function pickTag(xml, tag) {
	const cdata = new RegExp(
		`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`,
		"i",
	).exec(xml);
	if (cdata) return cdata[1].trim();
	const plain = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
	return plain ? plain[1].trim() : "";
}

function pickLink(xml, isAtom) {
	if (isAtom) {
		const alternate =
			/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i.exec(xml);
		if (alternate) return alternate[1].trim();
		const anyHref = /<link[^>]*href=["']([^"']+)["']/i.exec(xml);
		return anyHref ? anyHref[1].trim() : "";
	}
	return pickTag(xml, "link");
}

function decodeEntities(text) {
	return text
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&");
}

function normalizeText(text) {
	return decodeEntities(text.replace(/<[^>]+>/g, ""))
		.replace(/\s+/g, " ")
		.trim();
}

function parseTimestamp(raw) {
	if (!raw) return 0;
	const ts = Date.parse(raw);
	return Number.isNaN(ts) ? 0 : ts;
}

// 解析 RSS 2.0 / Atom
function parseFeed(xml) {
	if (!xml) return [];
	const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
	const tagName = isAtom ? "entry" : "item";
	const blocks =
		xml.match(new RegExp(`<${tagName}[\\s>][\\s\\S]*?</${tagName}>`, "gi")) || [];

	const items = [];
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

// ---------------------------------------------------------------- 抓取

async function fetchText(url, timeout) {
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
async function discoverFeed(site, timeout, paths) {
	const base = site.replace(/\/+$/, "");
	for (const path of paths) {
		const url = base + path;
		const { text, error } = await fetchText(url, timeout);
		if (error) continue;
		if (!/<rss[\s>]/i.test(text) && !/<feed[\s>]/i.test(text)) continue;
		if (parseFeed(text).length > 0) return url;
	}
	return null;
}

// 抓取单个订阅源：优先用配置地址，失败再自动探测
async function fetchSource(source, timeout, limit, paths) {
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
			return { items: parsed.slice(0, limit), feedUrl: url, error: undefined };
		}
		lastError = "未解析到文章";
	}

	const discovered = await discoverFeed(
		source.site,
		Math.min(timeout, 5000),
		paths,
	);
	if (discovered) {
		const { text, error } = await fetchText(discovered, timeout);
		if (!error) {
			const parsed = parseFeed(text);
			if (parsed.length > 0) {
				return { items: parsed.slice(0, limit), feedUrl: discovered, error: undefined };
			}
		}
		return { items: [], feedUrl: undefined, error: "已找到订阅源但解析不出文章" };
	}

	return {
		items: [],
		feedUrl: undefined,
		error: source.feed ? lastError : "未探测到订阅源（可手动填写 feed 地址）",
	};
}

// ---------------------------------------------------------------- 主流程

async function main() {
	// 配置全部来自 src/config.ts，读取失败时自动降级为默认值
	const config = loadLocalConfig();
	const { timeout, limitPerSource, totalLimit } = config.options;
	const extraSources = config.extraSources;

	const { sources: friendSources, error: configError } = await loadFriendSources(
		timeout,
		config.friendUrls,
	);

	if (configError) {
		console.error(`[circle] 警告：${configError}`);
	}

	// 合并去重，额外配置优先；并按站点地址剔除不参与订阅的站点
	// 比较前统一去掉末尾斜杠，避免因写法差异漏判
	const normalize = (url) => String(url || "").replace(/\/+$/, "");
	const excluded = config.excluded.map(normalize);
	const merged = [];
	for (const source of friendSources) {
		if (extraSources.some((s) => s.name === source.name)) continue;
		if (excluded.includes(normalize(source.site))) {
			console.error(`[circle] ⊘ ${source.name} — 已配置为不订阅，跳过`);
			continue;
		}
		merged.push(source);
	}
	merged.push(...extraSources);

	console.error(`[circle] 共 ${merged.length} 个订阅源，开始抓取…`);

	const results = await Promise.all(
		merged.map(async (source) => {
			const result = await fetchSource(
				source,
				timeout,
				limitPerSource,
				config.feedPaths,
			);
			console.error(
				result.error
					? `[circle] ✗ ${source.name} — ${result.error}`
					: `[circle] ✓ ${source.name} — ${result.items.length} 篇`,
			);
			return { source, ...result };
		}),
	);

	const items = [];
	const failures = [];
	const sources = [];

	for (const result of results) {
		if (result.error) {
			failures.push({ name: result.source.name, error: result.error });
		} else {
			for (const item of result.items) {
				items.push({
					title: item.title,
					link: item.link,
					published: item.published,
					timestamp: item.timestamp,
					sourceName: result.source.name,
					sourceAvatar: result.source.avatar,
					sourceSite: result.source.site,
				});
			}
		}
		sources.push({
			name: result.source.name,
			site: result.source.site,
			avatar: result.source.avatar,
			feedUrl: result.feedUrl,
			ok: !result.error,
		});
	}

	items.sort((a, b) => b.timestamp - a.timestamp);

	const payload = {
		updatedAt: new Date().toISOString(),
		sourceCount: sources.length,
		sources,
		items: items.slice(0, totalLimit),
		failures,
	};

	writeFileSync(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");

	console.error(
		`[circle] 完成：${payload.items.length} 篇文章，${failures.length} 个站点失败`,
	);
	console.error(`[circle] 已写入 ${OUTPUT}`);
}

main().catch((error) => {
	console.error("[circle] 执行失败:", error);
	process.exit(1);
});
