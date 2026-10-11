import type { FeedSource } from "./rss";

// 圈子数据源配置

// ── 订阅来源：自动从主仓库的友链配置拉取 ────────────────────────────
// 主仓库中友链配置文件的位置，按顺序尝试，取第一个成功的
export const FRIENDS_CONFIG_URLS = [
	// raw 无缓存，改友链后立即生效
	"https://raw.githubusercontent.com/xingmihai/XMHAI/master/src/config/friendsConfig.ts",
	// 备用：jsDelivr CDN（有约 12 小时缓存）
	"https://cdn.jsdelivr.net/gh/xingmihai/XMHAI@master/src/config/friendsConfig.ts",
];

// ── 额外订阅源 ──────────────────────────────────────────────────
// 想订阅没在友链里的博客，写在这里即可
// feed 留空会自动探测 /rss.xml、/feed 等常见路径
export const EXTRA_SOURCES: FeedSource[] = [
	// {
	//   name: "示例博客",
	//   site: "https://example.com",
	//   avatar: "https://example.com/avatar.png",
	//   feed: "https://example.com/rss.xml",
	// },
];

// ── 抓取参数 ────────────────────────────────────────────────────
export const FETCH_OPTIONS = {
	// 单个订阅源的抓取超时（毫秒）
	timeout: 10000,
	// 每个订阅源最多取多少篇
	limitPerSource: 5,
	// 总共最多展示多少篇
	totalLimit: 40,
};

// ── 缓存 ────────────────────────────────────────────────────────
// 边缘缓存时间（秒）：这段时间内重复访问直接返回缓存，不会重复抓取
// 调小 → 更新更及时，但对友链站点请求更频繁
export const CACHE_MAX_AGE = 3600; // 1 小时

// ── CORS ────────────────────────────────────────────────────────
// 允许读取本接口的来源。* 表示任意站点都能读
// 若只允许自己的博客，改成 "https://www.5al.top"
export const CORS_ORIGIN = "*";
