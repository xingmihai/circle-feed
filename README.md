# Circle Feed

圈子数据源。部署在 Cloudflare Pages，对外只提供一个接口：

```
https://<你的域名>/circle.json
```

博客读取它渲染「圈子」页面，**更新文章不需要重建博客**。

## 工作方式

```
访客打开博客圈子页
      ↓
浏览器请求 /circle.json
      ↓
Cloudflare 边缘节点
   ├─ 缓存命中 → 直接返回（毫秒级）
   └─ 缓存未命中 → 抓取主仓库友链配置 → 并发抓取各站 RSS → 写入缓存
      ↓
返回 JSON，博客渲染
```

- 订阅源**自动从主仓库的友链配置拉取**，你改友链，这里自动同步，不用维护两份
- 站点没填 RSS 地址时，会自动探测 `/rss.xml`、`/feed`、`/atom.xml` 等常见路径
- 边缘缓存默认 1 小时，同一时间段内不会重复抓取，对友链站点友好
- 已带 CORS 头，博客跨域读取没问题

## 部署到 Cloudflare Pages

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. 选中本仓库，配置如下：

| 项目 | 值 |
|---|---|
| Framework preset | `None` |
| Build command | 留空 |
| Build output directory | `public` |

3. 保存并部署。完成后访问：

```
https://circle-feed.pages.dev/circle.json
```

> 重要：请在 Pages 项目设置里把 **Branch Preview 设为 None**（或只勾生产分支）。
> 否则每次推送都可能触发构建，白白消耗每月 500 次的免费额度。

## 自定义

全部在 `src/config.ts`：

| 配置 | 说明 |
|---|---|
| `FRIENDS_CONFIG_URLS` | 主仓库友链配置文件地址，按顺序尝试 |
| `EXTRA_SOURCES` | 额外订阅源，适合收录没加进友链的站点 |
| `FETCH_OPTIONS.timeout` | 单个订阅源超时（毫秒） |
| `FETCH_OPTIONS.limitPerSource` | 每个站点最多取几篇 |
| `FETCH_OPTIONS.totalLimit` | 总共最多展示几篇 |
| `CACHE_MAX_AGE` | 边缘缓存秒数，调小更新更及时 |
| `CORS_ORIGIN` | 允许读取的来源，`*` 或限定成自己的域名 |

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
pnpm install
pnpm dev
# 打开 http://localhost:8788/circle.json
```

## 许可

MIT
