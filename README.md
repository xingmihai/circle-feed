# Circle Feed

圈子数据源。部署在 GitHub Pages，对外只提供一个接口：

```
https://<用户名>.github.io/circle-feed/circle.json
```

博客读取它渲染「圈子」页面，**更新文章不需要重建博客**。

## 工作方式

```
GitHub Actions 触发（每 6 小时 / 改配置 / 手动）
      ↓
从主仓库 XMHAI 拉取友链配置
      ↓
并发抓取各站 RSS / Atom（未填地址则自动探测）
      ↓
生成 public/circle.json
      ↓
├─ 提交回仓库（留一份数据历史，失败也不影响部署）
└─ 部署到 GitHub Pages
      ↓
博客运行时读取 circle.json 渲染
```

关键点：

- **抓取只发生在这个仓库**，与主博客完全独立，不会触发博客重建
- 订阅源**自动从主仓库的友链配置拉取**，改友链自动同步，不用维护两份
- 站点没填 RSS 地址时自动探测 `/rss.xml`、`/feed`、`/atom.xml` 等常见路径
- 只部署 `public/` 目录，源码不会出现在 Pages 上

## 启用 GitHub Pages（只需做一次）

1. 仓库 **Settings → Pages**
2. **Source** 选 **GitHub Actions**（不是 "Deploy from a branch"）
3. 保存

然后回到 **Actions → Update and Deploy → Run workflow** 手动跑一次。

跑完后访问验证：

```
https://xingmihai.github.io/circle-feed/circle.json
```

> 地址规则：`https://<用户名>.github.io/<仓库名>/`，仓库名是 `circle-feed`。
> 若绑定了自定义域名，把域名填进 **Pages → Custom domain** 即可。

## 自定义

全部在 `src/config.ts`：

| 配置 | 说明 |
|---|---|
| `EXCLUDED_SITES` | 不参与订阅的站点（按友链名称匹配），适合备案页、导航站这类没有 RSS 的友链 |
| `EXTRA_SOURCES` | 额外订阅源，适合收录没加进友链的站点 |
| `COMMON_FEED_PATHS` | 自动探测时依次尝试的路径 |
| `FRIENDS_CONFIG_URLS` | 主仓库友链配置文件地址，按顺序尝试 |
| `FETCH_OPTIONS` | 超时、每站条数、总数上限 |

改完 `src/config.ts` 直接生效，脚本会自动读取；配置文件缺失时脚本会降级使用内置默认值。

### 某个站点一直抓不到怎么办

先判断它是不是真的有 RSS：备案展示页、网址导航、工具站这类**本来就没有文章订阅源**，填进 `EXCLUDED_SITES` 即可，不必反复探测。

确实有 RSS 但探测不到的，在 `EXTRA_SOURCES` 里手动指定 `feed` 地址最稳妥。

抓取频率在 `.github/workflows/update.yml` 的 `cron` 里改，默认每 6 小时一次。

## 关于跨域（CORS）

博客从另一个域名读取本接口的 JSON，需要对方返回 CORS 头。GitHub Pages 通常会带上，但为保险起见，**建议博客端配置两个地址依次尝试**：

```
https://xingmihai.github.io/circle-feed/circle.json
https://cdn.jsdelivr.net/gh/xingmihai/circle-feed@main/public/circle.json
```

第二条走 jsDelivr CDN，一定带 CORS 头（有约 12 小时缓存）。这也是"提交回仓库"这一步的价值——让 jsDelivr 也能读到最新数据。

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
