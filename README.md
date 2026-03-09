# OmniNav · 个人 AI 智能驾驶舱

书签管理 + AI 助手一体的极简个人工作台，数据同步至 Cloudflare KV，支持自部署。

**版本**：v0.2.10

---
<img width="2160" height="1238" alt="image" src="https://github.com/user-attachments/assets/d5fcd0eb-b394-4552-8694-7f1d7f139a3b" />

## 功能与特点

### 书签与分类

- **置顶区**：置顶高频网站，无数量上限；展示区固定高度、超出可滚动。网格自适应屏幕宽度，移动端最窄可并排显示 3 个书签。
- **分类卡片**：支持 **4 级折叠高度**（仅标题 / 3 行 / 10 行 / 全部展开），状态自动保存；分类设置按键左移至标题旁，操作更高效。
- **拖拽排序**：支持分类块、书签项拖拽排序及跨分类移动；可将书签拖到目标分类的**标题行**松开，书签会移入该分类并排在首位。可在顶部栏统一开启或关闭「拖动书签」模式。
- **未分类**：独立区域在分类下方，支持添加、导入 HTML、检测并清理失效链接、**AI 自动归类**。操作按键左移至标题旁，布局更统一。
- **链接健康**：检测书签连通性，异常时图标显示状态点（灰/黄/绿）；支持批量清理失效链接。
- **悬浮说明**：分类名与书签的悬浮说明使用与页面风格一致的自定义样式（圆角、阴影、深色模式），替代浏览器原生提示框。

### 搜索

- **聚合搜索**：位于首页内容区（**置顶下方、分类上方**），支持**网页搜索**与**书签搜索**；**默认书签搜索**，有输入时才显示书签结果下拉。点击「网页/书签」标签或 Tab 键切换模式；点击弹层外任意区域或按 Escape 关闭下拉并退出书签模式。
- **多引擎**：支持 Google、Bing、百度、DuckDuckGo、Yandex、GitHub，可在设置中切换默认引擎（仅网页搜索时显示）。
- **书签搜索**：本地按标题、URL、描述、分类名匹配，支持多关键词 AND 过滤，下拉选择后打开。

### AI 能力

- **AI 对话**：顶部栏入口打开右侧抽屉，与自配置大模型对话（需在设置中填写 Base URL、Model、API Key）。
- **AI 自动归类**：将未分类书签交由大模型判断，归入已有分类或建议新分类；支持深度分析（抓取网页摘要）。
- **AI 快速添加**：顶部栏「快速添加」图标（与 AI 对话并列），点击弹出浮层，粘贴 URL 后由 AI 自动生成标题、描述并归类入库；支持多 URL 批量添加与深度网页分析。添加完成后会在励志语位置显示绿色成功提示 **5 秒**后恢复。
- **AI 生成说明**：编辑分类时可一键让 AI 生成分类说明。
- **励志语**：位于「置顶」区标题右侧，由大模型随机生成 12 条励志语（两端 ✨ 图标装饰），每 5 分钟自动轮播一条，点击可手动切换下一条。

### 设置

- **通用设置**：主题模式（跟随系统 / 浅色 / 深色）、默认搜索引擎、链接打开方式（新标签页 / 当前页面）。
- **AI 助手**：Base URL / Model / API Key 配置，一键测试连接验证配置有效性。
- **天气位置**：自动检测或手动搜索城市。
- **数据管理**：
  - **OmniNav JSON**：完整导出/导入（书签、分类、置顶、配置）。
  - **清空数据**：清空所有数据并同步云端（需输入当前登录密码确认）。

### 其他

- **云端同步**：书签、分类、置顶、设置存于 Cloudflare KV；同步状态展示在页面最底部。
- **顶部信息条**：显示 **天气现象 + 温度（1 位小数）** 与时间（`03月09日 星期一 15:21`），天气数据由 Open‑Meteo 提供并在边缘缓存（15 分钟）。
- **响应式布局**：完美适配桌面与移动端。顶部栏功能区整合「拖动开关」、「主题切换」、「快速添加」、「AI 对话」、「设置」与「退出」，布局紧凑有序（方形圆角、玻璃/靛蓝主色）。

---

## 技术栈

- **前端**：Vue 3 + Vite + Tailwind CSS v4 + Pinia + VueUse + vuedraggable
- **API**：Hono on Cloudflare Pages Functions
- **存储**：Cloudflare KV（`KV_OMNINAV`）

**AI 提示词**：所有发给大模型的提示词统一在 `src/constants/prompts.ts` 中配置，便于修改与多语言扩展；校验脚本见 `scripts/verify-prompts.ts`。

---

## 文档

- [更新日志](CHANGELOG.md)
- [开源协议](LICENSE)（MIT）

---

## 本地开发

**环境**：建议 Node 18 或 Node 20。

```bash
# 安装依赖
npm install
```

**启动（推荐）**：

```bash
npm run dev:all
```

浏览器打开终端中 Vite 输出的本地地址（如 `http://localhost:5173`）。前端请求 `/api` 会代理到 Wrangler Pages（8789）。

**登录方式（与生产一致）**：默认不配置 `.dev.vars`，首次打开显示「首次使用，请设置密码」，由访问者设置密码后即可使用。若已存在 `.dev.vars` 且配置了 `OMNINAV_OWNER_PASSWORD`，请删除该行或移除该文件以恢复首次设密流程。若需测试「部署密码」流程，可参考 `.dev.vars.example`。

**可选**：  
- 仅前端：`npm run dev`  
- 仅 API：先 `npm run build`，再 `npm run dev:api`  

---

## 常用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 仅启动前端 |
| `npm run dev:api` | 仅启动 API（需先 build） |
| `npm run dev:all` | 前端 + API 同时启动（推荐） |
| `npm run build` | 生产构建 |
| `npm run deploy` | 构建并部署到 Cloudflare Pages |
| `npm run reset:prod` | 重置生产环境数据（清空所有 KV 数据） |
| `npx tsx scripts/verify-prompts.ts` | 校验 AI 提示词配置（不依赖浏览器） |

---

## 用户部署

### 方式一：GitHub 集成（推荐）

1. 在 [Cloudflare Dashboard](https://dash.cloudflare.com) 创建 **Workers & Pages** → **Pages** → **Connect to Git**，连接本仓库。
2. 构建配置：Build command 填 `npm run build`，Build output directory 填 `dist`。
3. **绑定 KV**（建议在首次部署前完成）：先创建 KV 命名空间（Workers & Pages → KV → Create），再在 Pages 项目 **Settings** → **Bindings** 中点击 **Add** → 选择 **KV namespace**，变量名 `KV_OMNINAV`，选择刚创建的命名空间。项目不包含 wrangler.toml，Bindings 的 Add 按钮可用。
4. 保存后触发部署，完成后访问站点。

**密码方式（二选一）**：
- **首次访问者设密**（默认）：不配置 `OMNINAV_OWNER_PASSWORD`，首次打开站点时由访问者设置密码，设置后即可使用。
- **部署密码**：Settings → Environment variables → 新增 `OMNINAV_OWNER_PASSWORD`（勾选 Encrypt），首次登录用该密码，并可选择设置新密码。

### 方式二：Wrangler CLI

```bash
npm run deploy
```

部署后需在 Cloudflare 控制台为 Pages 项目绑定 KV 命名空间 `KV_OMNINAV`。

### 重置密码

- **修改密码**（记得当前密码）：登录后进入 **设置** → **修改密码**，填写当前密码与新密码。
- **忘记密码**：  
  - 已登录：调用 `POST /api/admin/reset-auth-state`，请求体 `{ "password": "当前密码" }`，退出后重新登录（若配置了部署密码则用部署密码；否则需删除 KV 后由首次访问者重新设密）。  
  - 未登录：在 Cloudflare Dashboard → **KV** 中删除 `auth:password_hash` 和 `auth:first_login_done`；或用 Wrangler 删除。若配置了部署密码，删除后用部署密码登录；若未配置，删除后由首次访问者重新设密。

### 说明

上述步骤已覆盖 KV 绑定、密码配置与重置；自定义域名等在 Cloudflare Dashboard 的 Pages 项目 **Settings → Custom domains** 中配置。
