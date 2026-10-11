# Circle Feed

圈子数据源。部署在 Cloudflare Pages，对外只提供一个接口：

```
https://<你的域名>/circle.json
```

博客读取它渲染「圈子」页面，**更新文章不需要重建博客**。

## 工作方式

```
GitHub Actions 定时触发（每 6 小时 / 改配置 / 手动）
      ↓
从主仓库 XMHAI 拉取友链配置
      ↓
并发抓取各站 RSS / Atom（未填地址则自动探测）
      ↓
生成 public/circle.json 并提交回仓库
      ↓
Cloudflare Pages 检测到变更 → 自动部署
      ↓
博客运行时读取 /circle.json 渲染
```

关键点：

- **抓取只发生在这个仓库**，与主博客完全独立，不会触发博客重建
- 订阅源**自动从主仓库的友链配置拉取**，改友链自动同步，不用维护两份
- 站点没填 RSS 地址时自动探测 `/rss.xml`、`/feed`、`/atom.xml` 等常见路径
- 内容无变化时跳过提交，不产生空提交、不浪费部署额度
- **不需要任何 API Token**——靠 Pages 的 Git 集成自动部署

## 部署到 Cloudflare Pages

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. 选中本仓库，配置如下：

| 项目 | 值 |
|---|---|
| Framework preset | `None` |
| Build command | 留空 |
| Build output directory | `public` |

3. 保存并部署。然后回到 GitHub，手动触发一次 Actions（**Actions → Update Circle Data → Run workflow**）生成数据。

4. 访问验证：

```
https://circle-feed.pages.dev/circle.json
```

> ⚠️ 请在 Pages 设置里把 **Branch Preview 设为 None**（或只勾生产分支）。
> 否则每次推送都可能触发构建，白白消耗每月 500 次的免费额度。

## 自定义

全部在 `src/config.ts`：

| 配置 | 说明 |
|---|---|
| `EXTRA_SOURCES` | 额外订阅源，适合收录没加进友链的站点 |
| `FRIENDS_CONFIG_URLS` | 主仓库友链配置文件地址，按顺序尝试 |
| `FETCH_OPTIONS` | 超时、每站条数、总数上限（改这里需同步改脚本内常量） |

抓取频率在 `.github/workflows/update.yml` 的 `cron` 里改，默认每 6 小时一次。

## 返回格式

```json
{
  "updatedAt": "2026-10-11T08:00:00.000Z",
  "sourceCount": 6,
  "sources": [
    {
      "name": "笑的博客",
      "site": "https://blog.xiaow.qzz.io",
      "avatar": "https://...",
      "feedUrl": "https://blog.xiaow.qzz.io/rss.xml",
      "ok": true
    }
  ],
  "items": [
    {
      "title": "文章标题",
      "link": "https://...",
      "published": "2026-10-10T12:00:00Z",
      "timestamp": 1791614400000,
      "sourceName": "笑的博客",
      "sourceAvatar": "https://...",
      "sourceSite": "https://blog.xiaow.qzz.io"
    }
  ],
  "failures": [{ "name": "某站", "error": "未探测到订阅源" }]
}
```

`failures` 列出抓取失败的站点，方便排查——单个站点失败不影响其他站点。

## 本地调试

```bash
node scripts/fetch-circle.mjs
cat public/circle.json
```

脚本为零依赖纯 Node 实现，不需要 `npm install`，Node 18+ 即可运行。

## 许可

MIT
