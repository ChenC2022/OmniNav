# OmniNav · 个人 AI 智能驾驶舱

书签管理与 AI 助手一体的极简个人工作台。

- **技术栈**：Vue 3 + Vite + Tailwind CSS v4 + Pinia + VueUse + vuedraggable；API：Hono on Cloudflare Pages Functions；存储：KV（Cloudflare KV）
- **文档导航**：[需求 PRD](docs/OmniNav%20PRD.md) · [开发计划](docs/DEVELOPMENT_PLAN.md) · [部署指南](docs/DEPLOY_TO_CLOUDFLARE.md) · [部署前自测](docs/PRE_DEPLOY_CHECKLIST.md)

## 功能概览

- **首页**：常用（置顶书签，可独立添加链接或从分类中选择，拖拽排序）、分类卡片（书签按分类展示，支持私密分类密码解锁；宽屏自适应多列 / 可选 CSS 多列瀑布流；**删除分类时该分类下书签会移入未分类**）、**未分类**（独立区域，在分类下方：图标按钮添加 / 导入 / 清理失效 / 自动归类，书签网格自适应列数）、检查链接、新建/编辑分类与书签
- **全局**：顶部栏（城市 + 时间 + 天气、聚合搜索（模式标签网页/书签、Tab 或点击切换；网页模式可选搜索引擎，书签模式仅搜本地）、⌘K 聚焦书签搜索、AI、设置）、右侧 AI 抽屉对话、底部 Footer（主题切换、同步状态）
- **设置页**：AI 对话配置、背景（默认背景 / Bing 每日一图）、天气位置（自动检测 / 选择城市）、导出/导入（含书签、分类、置顶与配置）、**关于**（应用功能说明与当前版本）

**环境**：建议使用 Node 18 或 Node 20（Node 22 可能与当前 Vite/esbuild 存在 ESM 兼容性问题）。

## 技术架构概览

- **前端**：Vue 3 + Vite + Tailwind v4，入口 `src/main.ts` / `App.vue`；Pinia 管理书签、分类、置顶、设置等；路由含首页（驾驶舱）与设置页。
- **API**：`functions/api/[[path]].ts`，Hono 挂载在 `/api`，提供书签/分类/置顶/设置的读写、favicon 代理、链接检查、天气与地理编码、AI 对话转发等；数据存于 KV 命名空间 `KV_OMNINAV`。
- **部署**：Vite 构建到 `dist`，与 `functions/` 一起由 Cloudflare Pages 托管，详见 [部署指南](docs/DEPLOY_TO_CLOUDFLARE.md)。

## 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 创建 KV 命名空间（首次）

```bash
npx wrangler kv namespace create KV_OMNINAV
```

将输出的 `id` 填入 `wrangler.toml` 中 `[[kv_namespaces]]` 的 `id` 字段（若已有占位 id 则替换即可）。

### 3. 启动与访问地址

**推荐：一条命令同时起前端和 API**

```bash
npm run dev:all
```

启动后：

| 服务 | 端口 | 说明 |
|------|------|------|
| **前端（Vite）** | **5173**（若被占用则 5174） | 在终端查看 **Vite 输出的 “Local: http://localhost:xxxx”**，用该地址在浏览器打开 |
| **API（Wrangler Pages）** | **8789** | 仅用于 Vite 代理，前端请求 `/api` 会自动转到 8789，无需手动访问 |

**请只运行一次 `npm run dev:all`**。用浏览器打开终端里 Vite 打印的前端地址即可（默认 `http://localhost:5173`）。

**可选：两终端分别起**

- 终端 1：`npm run dev:api`（API 占 8789）
- 终端 2：`npm run dev`（前端占 5173）
- 浏览器访问：`http://localhost:5173`

**常见问题**

- 若 5173 已被占用，Vite 会改用 5174 等，终端会显示实际地址，以终端为准。
- 若提示 8789 已被占用，请先结束之前运行的 `wrangler pages dev`，再执行 `dev:all` 或 `dev:api`。
- 数据为空时，首次打开前端会自动注入演示数据（多分类 + 多链接），便于查看效果；也可在设置页「导出 / 导入」下点击「加载演示数据」追加。

## 常用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 仅启动前端（Vite） |
| `npm run dev:api` | 仅启动 API（需先 `npm run build`） |
| `npm run dev:all` | 同时启动前端 + API（推荐） |
| `npm run build` | 生产构建 |
| `npm run preview` | 本地预览构建结果 |
| `npm run deploy` | 构建并部署到 Cloudflare Pages |

## 构建与部署

```bash
npm run build
npx wrangler pages deploy dist
```

生产环境 KV 需在 Cloudflare 控制台为该项目绑定同名 `KV_OMNINAV`。完整步骤见 [部署指南](docs/DEPLOY_TO_CLOUDFLARE.md) 与 [部署前自测](docs/PRE_DEPLOY_CHECKLIST.md)。
