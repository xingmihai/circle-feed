// 圈子数据源配置
//
// 说明：本文件会被 scripts/fetch-circle.mjs 以文本方式解析，
// 因此请保持各 `export const xxx = [...]` 的写法与字段格式，
// 注释以 // 开头（整行注释会被自动忽略）

// ── 不参与订阅的站点 ────────────────────────────────────────────
// 按友链中的站点地址（siteurl）匹配，填在这里的站点不会被抓取
// 比较时会忽略末尾的斜杠，因此写不写 / 都可以
// 适合那些确实没有文章订阅源的友链；空数组表示全部都尝试抓取
// 抓不到的站点会出现在输出的 failures 里，不影响其他站点
export const EXCLUDED_SITES = [
	// 聚合/导航/展示类站点，不是个人博客，其订阅源里的文章并非博主本人所写
	"https://www.blogsclub.org/",
	"https://webteleporter.top/",
	"https://icp.gov.moe/aboutus.php",
	"https://www.boyouquan.com/",
];

// ── 额外订阅源 ──────────────────────────────────────────────────
// 主仓库 XMHAI 的友链会自动作为订阅源，无需在这里重复添加
// 这里只填想订阅、但没加进友链的站点
// feed 留空会自动探测 COMMON_FEED_PATHS 中的路径
export const EXTRA_SOURCES = [
	// {
	//   name: "示例博客",
	//   site: "https://example.com",
	//   avatar: "https://example.com/avatar.png",
	//   feed: "https://example.com/rss.xml",
	// },
];

// ── 自动探测时依次尝试的订阅源路径 ────────────────────────────────
// 站点未手动指定 feed 地址时，按顺序尝试这些路径
export const COMMON_FEED_PATHS = [
	// 通用
	"/rss.xml",
	"/atom.xml",
	"/feed",
	"/feed.xml",
	"/index.xml",
	"/rss/",
	"/feed/rss.xml",
	// Typecho 常用：带斜杠的 /feed/ 与不带斜杠的 /feed 并不等价
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

// ── 抓取参数 ────────────────────────────────────────────────────
export const FETCH_OPTIONS = {
	timeout: 15000, // 单个订阅源抓取超时（毫秒）；小站响应慢可适当调大
	limitPerSource: 5, // 每个站点最多取几篇
	totalLimit: 40, // 总共最多展示几篇
};

// ── 主仓库友链配置地址 ───────────────────────────────────────────
// 按顺序尝试，取第一个成功的。改友链后这里会自动同步
export const FRIENDS_CONFIG_URLS = [
	"https://raw.githubusercontent.com/xingmihai/XMHAI/master/src/config/friendsConfig.ts",
	"https://cdn.jsdelivr.net/gh/xingmihai/XMHAI@master/src/config/friendsConfig.ts",
];
