import type { FeedSource } from "./rss";
import { FRIENDS_CONFIG_URLS } from "./config";

// 从主仓库的 friendsConfig.ts 源码中解析出启用的友链
// 用轻量文本解析代替 TypeScript 编译，避免在边缘运行时引入编译器

// 去掉整行注释，避免被注释掉的示例配置被当成真实订阅源
// 只处理行首为 // 的行，不误伤 URL 里的 https://
function stripCommentLines(source: string): string {
	return source
		.split("\n")
		.filter((line) => !/^\s*\/\//.test(line))
		.join("\n");
}

// 截取 `export const friendsConfig = [...]` 数组内部的内容
// 用 `[=:] [` 定位数组起点，避开 `FriendLink[]` 这类类型注解里的方括号
function sliceArrayBody(source: string, anchor: string): string {
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
function splitObjects(body: string): string[] {
	const blocks: string[] = [];
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

function pickField(block: string, key: string): string | undefined {
	const matched = new RegExp(`${key}\\s*:\\s*"([^"]*)"`, "i").exec(block);
	return matched ? matched[1] : undefined;
}

function pickBoolean(block: string, key: string, fallback = true): boolean {
	const matched = new RegExp(`${key}\\s*:\\s*(true|false)`, "i").exec(block);
	return matched ? matched[1] === "true" : fallback;
}

// 把配置源码解析成订阅源列表
export function parseFriendsConfig(source: string): FeedSource[] {
	const body = sliceArrayBody(stripCommentLines(source), "export const friendsConfig");
	return splitObjects(body)
		.filter((block) => pickBoolean(block, "enabled", true))
		.map((block) => ({
			name: pickField(block, "title") || "",
			site: pickField(block, "siteurl") || "",
			avatar: pickField(block, "imgurl") || undefined,
			feed: pickField(block, "rss") || undefined,
		}))
		.filter((item) => item.name && item.site);
}

// 从主仓库拉取友链配置并解析
export async function loadFriendSources(
	timeout: number,
): Promise<{ sources: FeedSource[]; error?: string }> {
	for (const url of FRIENDS_CONFIG_URLS) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeout);
		try {
			const res = await fetch(url, {
				signal: controller.signal,
				headers: { "User-Agent": "Mozilla/5.0 (compatible; CircleFeed/1.0)" },
			});
			if (!res.ok) continue;
			const sources = parseFriendsConfig(await res.text());
			if (sources.length > 0) return { sources };
		} catch {
			// 换下一个地址继续尝试
		} finally {
			clearTimeout(timer);
		}
	}
	return { sources: [], error: "未能读取主仓库的友链配置" };
}
