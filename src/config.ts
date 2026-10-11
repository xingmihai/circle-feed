// 圈子数据源配置
//
// 说明：本文件会被 scripts/fetch-circle.mjs 以文本方式解析，
// 因此请保持 `export const EXTRA_SOURCES = [...]` 的写法与字段格式，
// 注释以 // 开头（整行注释会被自动忽略）

// ── 额外订阅源 ──────────────────────────────────────────────────
// 主仓库 XMHAI 的友链会自动作为订阅源，无需在这里重复添加
// 这里只填想订阅、但没加进友链的站点
// feed 留空会自动探测 /rss.xml、/feed、/atom.xml 等常见路径
export const EXTRA_SOURCES = [
	// {
	//   name: "示例博客",
	//   site: "https://example.com",
	//   avatar: "https://example.com/avatar.png",
	//   feed: "https://example.com/rss.xml",
	// },
];

// ── 抓取参数 ────────────────────────────────────────────────────
// 以下数值如需调整，请同步修改 scripts/fetch-circle.mjs 中 main() 里的常量
export const FETCH_OPTIONS = {
	timeout: 10000, // 单个订阅源抓取超时（毫秒）
	limitPerSource: 5, // 每个站点最多取几篇
	totalLimit: 40, // 总共最多展示几篇
};

// ── 主仓库友链配置地址 ───────────────────────────────────────────
// 按顺序尝试，取第一个成功的。改友链后这里会自动同步
export const FRIENDS_CONFIG_URLS = [
	"https://raw.githubusercontent.com/xingmihai/XMHAI/master/src/config/friendsConfig.ts",
	"https://cdn.jsdelivr.net/gh/xingmihai/XMHAI@master/src/config/friendsConfig.ts",
];
