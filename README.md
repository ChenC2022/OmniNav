# OmniNav · AI 驱动的个人书签管理与导航站

由AI协助用户进行个人书签管理，数据与个人的Cloudflare KV同步，Cloudflare pages 零成本自部署。


---
<img width="2160" height="1238" alt="image" src="https://github.com/user-attachments/assets/d5fcd0eb-b394-4552-8694-7f1d7f139a3b" />

## 功能与特点

### 亮点

- **零成本** —— Cloudflare pages 零成本自部署
- **高智能** —— 用户可配置自己的AI大模型（可以是本地模型），由大模型按需分析URL和网站内容，进行自动分类
- **高便利** —— 提供网页版和插件，书签跨设备完全同步。

### 书签与分类

- **置顶区**：置顶高频网站，无数量上限；展示区固定高度、超出可滚动。网格自适应屏幕宽度，移动端最窄可并排显示 3 个书签。
- **分类卡片**：支持 **4 级折叠高度**（仅标题 / 3 行 / 10 行 / 全部展开），状态自动保存；分类设置按键左移至标题旁，操作更高效。
- **拖拽排序**：支持分类块、书签项拖拽排序及跨分类移动；可将书签拖到目标分类的**标题行**松开，书签会移入该分类并排在首位。可在顶部栏统一开启或关闭「拖动书签」模式。
- **未分类**：独立区域在分类下方，支持添加、导入 HTML、检测并清理失效链接、**AI 自动归类**。操作按键左移至标题旁，布局更统一。
- **链接健康**：检测书签连通性，异常时图标显示状态点（灰/黄/绿）；支持批量清理失效链接。
- **书签图标**：多路自动获取（Google S2、站点 favicon、HTML 解析、主域名 fallback）；编辑书签时可填「图标地址」使用自定义图标，适用于无法自动拉取的站点。
- **悬浮说明**：分类名与书签的悬浮说明使用与页面风格一致的自定义样式（圆角、阴影、深色模式），替代浏览器原生提示框。

### 搜索

- **聚合搜索**：位于首页内容区（**置顶下方、分类上方**），支持**网页搜索**与**书签搜索**；**默认书签搜索**，有输入时才显示书签结果下拉。点击「网页/书签」标签或 Tab 键切换模式；点击弹层外任意区域或按 Escape 关闭下拉并退出书签模式。
- **多引擎**：支持 Google、Bing、百度、DuckDuckGo、Yandex、GitHub，可在设置中切换默认引擎（仅网页搜索时显示）。
- **书签搜索**：本地按标题、URL、描述、分类名匹配，支持多关键词 AND 过滤，下拉选择后打开。

### AI 能力

- **AI 自动归类**：将未分类书签交由大模型判断，归入已有分类或建议新分类；支持深度分析（抓取网页摘要）。
- **AI 快速添加**：顶部栏「快速添加」图标（与 AI 对话并列），点击弹出浮层，粘贴 URL 后由 AI 自动生成标题、描述并归类入库；支持多 URL 批量添加与深度网页分析。
- **AI 生成书签和分类说明**：编辑分类时可一键让 AI 生成分类说明。说明也将被用于AI分析的依据。
- **AI 对话（书签检索助手）**：顶部栏入口打开右侧抽屉，与自配置大模型对话。会话会将用户**全部书签与分类**（名称 + 说明）作为上下文注入，AI 主要作为书签检索助手（如「我收藏了哪些 Vue 相关链接？」），也可正常聊天或回答一般问题。助手回复支持 **Markdown 渲染**（加粗、列表、链接等），并对 HTML 做安全过滤，所有链接会在新标签页打开。需在设置中填写 Base URL、Model、API Key。界面展示**每句与本次对话的 token 消耗**（输入/输出/合计），便于评估用量；当前策略为全量注入书签，未设条数或 token 上限。
- **励志语**：位于「置顶」区标题右侧，由大模型随机生成 12 条励志语（两端 ✨ 图标装饰），每 5 分钟自动轮播一条，点击可手动切换下一条。
- **分类准确性等取决于AI 模型能力和说明的完整性和清晰度**

### 设置

- **通用设置**：主题模式（跟随系统 / 浅色 / 深色）、默认搜索引擎、链接打开方式（新标签页 / 当前页面）。
- **AI 助手**：Base URL / Model / API Key 配置，一键测试连接验证配置有效性。（不设置将无法进行高智能部分功能）
- **天气位置**：自动检测或手动搜索城市。
- **数据管理**：
  - **OmniNav JSON**：完整导出/导入（书签、分类、置顶、配置）。
  - **清空数据**：清空所有数据并同步云端（需输入当前登录密码确认）。
- **浏览器插件**：设置页可下载插件包（zip），解压后在 Chrome/Edge 中「加载已解压的扩展程序」即可安装。

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

**AI 对话（书签上下文）**：`POST /api/ai/chat` 在鉴权后从 KV 读取 `bookmarks` 与 `categories`，在 `functions/api/[[path]].ts` 内通过 `buildBookmarkContextSystemPrompt` 拼成系统提示（分类名+说明、书签标题+URL+描述，按分类分组），以 `role: system` 注入后连同用户消息转发至 OpenAI 兼容的 `/chat/completions`。上游返回的 `usage`（prompt_tokens / completion_tokens / total_tokens）原样返回前端；前端在 `ChatPanel.vue` 中展示每句与本轮对话累计的 token 消耗。当前无条数或 token 上限，全量注入。

---

## 浏览器插件

OmniNav 提供配套的 Chrome / Edge 浏览器插件，实现随时唤起、随手检索、随手收藏、随手 AI 对话。

### 功能

- **快速检索**：Popup 搜索框本地检索书签（标题 / URL / 描述），结果显示分类徽章
- **置顶便捷访问**：Popup 顶部展示置顶书签网格，一键点击打开
- **快捷收藏**：
  - Popup「收藏」按钮：AI 自动推荐分类 + 可编辑确认卡片后保存
  - 右键菜单「添加到 OmniNav」：二级菜单，可选「自动分类」或「暂不分类」
- **AI 对话（Side Panel）**：点击 AI 按钮打开右侧 Side Panel，与书签助手对话，支持 Markdown 渲染
- **自动同步**：打开 Popup 时自动静默同步最新数据
- **深色模式**：自动跟随系统外观（Popup 与 AI Side Panel 均支持）
- **网页版入口**：底部按钮一键跳转 OmniNav 网页版进行书签管理

### 安装与构建

**前提**：已完成网页版部署，获得 Pages 域名（如 `https://xxx.pages.dev`）。

**方式一（推荐）**：在网页版 **设置 → 浏览器插件** 中点击「下载插件包」，解压后在浏览器中加载已解压的扩展程序。部署时 `npm run deploy` 会自动构建并打包插件 zip（需已安装 `zip`，如 Ubuntu/Debian: `apt install zip`）。

**方式二（本地构建）**：

```bash
# 进入插件目录
cd extensions/omninav-extension

# 安装依赖
npm install

# 构建（产物输出至 extensions/omninav-extension/dist/）
npm run build
```

**加载插件（Chrome / Edge）**：

1. 打开 `chrome://extensions/`（或 Edge 的 `edge://extensions/`），启用右上角**开发者模式**
2. 点击**加载已解压的扩展程序**，选择解压后的插件目录（或上述 `extensions/omninav-extension/dist/`）
3. 插件图标出现在工具栏

### 初始设置

1. 打开插件**设置页**（右键工具栏图标 → 选项）
2. 填写 **baseUrl**（你的 OmniNav Pages 域名，如 `https://xxx.pages.dev`）→ 点击**保存**
3. 点击**授权站点权限**，在浏览器弹窗中确认授权
4. 填写**登录密码** → 点击**登录**
5. 点击**立即同步**，完成初始化

设置完成后，点击工具栏插件图标即可打开 Popup 使用全部功能。

---

## 文档

- [Phase 2 插件开发计划](docs/PHASE2_BROWSER_EXTENSION_PLAN.md)
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

1. Fork 项目到 Github 下
2. 在 [Cloudflare Dashboard](https://dash.cloudflare.com) 创建 **Workers & Pages** → **Pages** → **Connect to Git**，连接本仓库。
3. 构建配置：Build command 填 `npm run build`，Build output directory 填 `dist`。
4. **绑定 KV**（建议在首次部署前完成）：先创建 KV 命名空间（Workers & Pages → KV → Create），再在 Pages 项目 **Settings** → **Bindings** 中点击 **Add** → 选择 **KV namespace**，变量名 `KV_OMNINAV`，选择刚创建的命名空间。项目不包含 wrangler.toml，Bindings 的 Add 按钮可用。
5. 保存后触发部署，完成后访问站点。
6. 墙内用户 Pages 绑定自己的域名即可正常访问。
7. 登录后在设置页面配置自己的大模型 API Key 才可由AI 进行自动归类等功能。API Key 兼容ChatGPT 方式。也可兼容 ollama 等建立本地模型。

**密码方式（二选一）**：
- **首次访问者设密**（推荐）：不配置 `OMNINAV_OWNER_PASSWORD`，首次打开站点时由访问者设置密码，设置后即可使用。
- **部署密码**：Settings → Environment variables → 新增 `OMNINAV_OWNER_PASSWORD`（勾选 Encrypt），首次登录用该密码，并可选择设置新密码。

### 方式二：Wrangler CLI

```bash
npm run deploy
```

部署后需在 Cloudflare 控制台为 Pages 项目绑定 KV 命名空间 `KV_OMNINAV`。

### 重置密码

- **修改密码**（记得当前密码）：登录后进入 **设置** → **修改密码**，填写当前密码与新密码。
- **忘记密码**： 在 Cloudflare Dashboard → **KV** 中删除 `auth:password_hash` 和 `auth:first_login_done`；或用 Wrangler 删除。若配置了部署密码，删除后用部署密码登录；若未配置，删除后由首次访问者重新设密。

### 说明

上述步骤已覆盖 KV 绑定、密码配置与重置；自定义域名等在 Cloudflare Dashboard 的 Pages 项目 **Settings → Custom domains** 中配置。
