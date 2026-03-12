# Phase 2 · 浏览器插件开发计划（风险可控版）

> 本文档随第二阶段进度持续更新，用于对齐需求、技术方案、里程碑与风险控制策略。  
> 第一阶段（网页应用）总体方案与既有 API/KV 结构见 `docs/DEVELOPMENT_PLAN.md` 与 `README.md`。

---

## 1. 背景与目标

第二阶段目标：在不破坏第一阶段成果的前提下，为 OmniNav 增加浏览器插件能力，实现“随时唤起、随手检索、随手收藏、随手对话”。

- **核心功能（目标范围）**
  - **检索**：快速搜索书签（标题/URL/描述/分类名），低延迟。
  - **置顶书签便利使用**：快速打开、排序、加/取消置顶。
  - **快捷添加书签**：收藏当前页/右键添加/快捷键添加；可选 AI 增强。
  - **便利的 AI 会话**：以书签检索助手为主，支持一般对话。

- **总体原则**
  - **低风险优先**：优先在插件侧实现能力，后端改动以“新增接口/增强协议”为主，避免破坏式重构。
  - **兼容优先**：不改变第一阶段网页端既有行为；若必须调整协议，保证旧客户端可继续工作。
  - **可回滚**：任何后端增强都应可独立关闭或保持旧路径可用。

---

## 2. 非目标（Phase 2 不做/后期做）

为控制变更风险，以下能力不作为 Phase 2 的第一优先级（可在后期规划）：

- **高风险数据一致性改造**：例如直接将现有 `PUT /api/data/*` 改为破坏式增量写，或变更 KV 数据结构。
- **多租户/多用户体系**：Phase 2 仍按单用户 KV 模型（见 `docs/SINGLE_USER_VS_MULTITENANT.md`）。
- **大规模 AI 成本优化**：例如服务端向量检索、RAG 管线、复杂上下文压缩（可作为 Phase 2.5/3）。
- **读取并接管浏览器原生书签树**：第一版只同步 OmniNav 自己的 KV 数据，避免权限与迁移复杂度膨胀。

---

## 2.1 进入开发前的决策清单（已确认默认值）

> 这部分用于锁定“低风险前置决策”，减少返工。若后续调整，需在「10. 进度记录」追加变更记录（含风险级别与回滚方案）。

- **版本号策略**：第二阶段（浏览器插件）发布从 **`1.x.x`** 开始（与第一阶段网页应用版本线分开管理）。
- **首发支持范围**：先做 **Chrome / Edge（Manifest V3）**；Firefox 适配后置。
- **主入口与信息架构**
  - **Popup 为主入口**：承载“检索 + 置顶 + 快存”。
  - **AI 会话为独立扩展页面**（长对话体验更稳定）；Side Panel 作为后续迭代选项。
- **登录流程**：插件内提供登录（调用 `/api/auth/login`，`credentials: "include"`）；不依赖网页端先登录。
- **数据同步策略（MVP）**
  - **启动同步 + 手动刷新**，不做定时后台同步。
  - 写入通过 Service Worker **串行队列**执行“读-改-写”，先接受并记录“偶发覆盖”风险，后续用增量端点/ETag 解决。
- **检索体验（MVP）**：先做“包含匹配 + 多关键词 AND”（与网页端一致）；模糊检索与更复杂排序后置。
- **快捷添加默认规则（MVP）**
  - 默认归入“未分类”（允许后续加“默认分类”设置）。
  - URL 去重：同 URL 默认不重复添加（提示已存在）。
- **权限策略**：遵循最小权限原则；MVP 不强依赖 `cookies` 权限（优先用接口探测登录态），确有必要时再引入并记录理由。

---

## 3. 风险分级与变更策略（必须遵守）

### 3.1 风险分级

- **低风险（优先）**
  - 插件端新增：UI、索引、缓存、快捷键、右键菜单等。
  - 后端仅新增新路由/新参数（不改变旧返回结构、不改变旧鉴权方式）。

- **中风险（需评估后进入）**
  - 为并发一致性新增版本号/ETag，客户端需要适配失败重试。
  - 为插件访问稳定性补充响应头（CORS/Vary/Cache-Control）且不扩大开放面。

- **高风险（后期规划；进入前必须谨慎评估）**
  - 改动既有 `/api/data/*` 的语义或 KV 结构导致网页端/历史数据迁移。
  - 引入新的鉴权体系并替换现有 cookie session（可新增 PAT，但不替换）。
  - 将 AI 逻辑大幅迁移到服务端、引入复杂持久化或新存储（D1/R2 等）。

### 3.2 变更策略（兼容性约束）

- **只新增不破坏（默认策略）**
  - 后端优先 **新增**：`/api/ext/*` 或更细粒度的新端点。
  - 旧端点保持可用：网页端继续用现有 `/api/data/*` 与 `/api/ai/chat`。

- **若必须触及既有协议**
  - 先实现“双栈”兼容：旧路径仍可用，新路径提供增强能力。
  - 文档中必须记录：变更原因、影响面、回滚方案、迁移策略与验收标准。

---

## 4. 复用第一阶段的现有能力（MVP 可直接复用）

从 `functions/api/[[path]].ts` 可直接复用的能力（无需修改即可完成 MVP）：

- **数据读写**
  - `GET/PUT /api/data/bookmarks`
  - `GET/PUT /api/data/categories`
  - `GET/PUT /api/data/pinned`
  - `GET/PUT /api/data/settings`
- **鉴权**
  - `POST /api/auth/login`（Set-Cookie `omninav_session`，HttpOnly session）
  - `POST /api/auth/logout`，`GET /api/auth/status`
- **AI / 元信息**
  - `POST /api/ai/chat`
  - `POST /api/extract-meta`
  - `POST /api/check-url`

> 结论：插件第一版可以做到 **不修改第一阶段网页应用**，只要插件正确接入登录态并同步数据。

---

## 5. 插件产品形态与入口（建议默认值）

### 5.1 首发支持范围

- **首发**：Chrome / Edge（Manifest V3）
- **后续**：Firefox（需要重新评估 Side Panel 与 MV3 差异）

### 5.2 入口组合（MVP）

- **Popup**：搜索 + 置顶 + 快捷收藏当前页
- **快捷键**：唤起 Popup 或打开扩展页面
- **右键菜单**：对当前页/链接一键“添加到 OmniNav”
- （可选）**Omnibox**：地址栏 `on <关键词>` 搜索 OmniNav 书签

---

## 6. 技术架构（MV3 推荐）

### 6.1 组件划分

- **Service Worker（后台）**
  - 同步 bookmarks/categories/pinned 到本地缓存
  - 构建与维护搜索索引（低延迟检索）
  - 处理 `commands`（快捷键）、`contextMenus`（右键菜单）、可选 `omnibox`
  - 统一串行化写入（降低并发覆盖概率）

- **Popup UI**
  - 搜索输入框 + 结果列表（本地检索）
  - 置顶区（打开/排序/置顶切换）
  - 快捷添加当前页（快存）

- **AI Chat 页面（第二迭代可选 Side Panel）**
  - 长对话更适合独立页面或 Side Panel
  - 直接调用 `POST /api/ai/chat`（沿用网页端展示 usage 的策略）

- （可选）**Content Script**
  - 选中文本/页面信息增强收藏体验（不作为 MVP 必需）

### 6.2 登录态策略（低风险复用）

沿用第一阶段 cookie session：

- 插件保存 `baseUrl`（用户的 Pages 域名）
- 插件执行登录：`POST ${baseUrl}/api/auth/login`，请求需带 `credentials: "include"`
- 之后所有 API 调用均带 `credentials: "include"`，自动携带 `omninav_session`

权限（初稿，最终以实现为准）：

- `host_permissions`: `${baseUrl}/*`
- `permissions`: `storage`, `tabs`, `contextMenus`, `commands`
- （推荐）`cookies`：用于更可靠地判断是否已登录/是否需要重新登录

---

## 7. 数据一致性与写入策略（先低风险，后增强）

### 7.1 MVP 写入策略（不改后端）

由于当前是 `PUT /api/data/*` 全量覆盖：

- 插件对写操作统一走 Service Worker 串行队列（减少覆盖概率）
- “读-改-写”流程：
  - `GET /api/data/bookmarks` 拉最新
  - 本地合并改动（添加/编辑/删除）
  - `PUT /api/data/bookmarks` 写回

### 7.2 后期（中风险）增强方向（可选）

不破坏旧接口的前提下，新增更安全的写入方式：

- **方案 A：新增增量端点（推荐）**
  - 例如：`POST /api/ext/bookmarks/add`、`PATCH /api/ext/bookmarks/:id`、`POST /api/ext/pinned/set`
  - 后端负责合并并写 KV，避免客户端覆盖

- **方案 B：ETag/版本号并发控制**
  - `GET` 返回 `version`/`ETag`
  - `PUT` 要求 `If-Match`
  - 冲突返回 `409`，客户端重试合并

> 以上均属于“中风险改动”：进入前需评估网页端是否需要同步适配，以及是否需要回滚开关。

---

## 8. 里程碑与验收标准（建议）

### M0：骨架与最小闭环（低风险）

- [x] 插件工程初始化（MV3）
- [x] 配置页：设置 `baseUrl`
- [x] 站点授权：对 `baseUrl` 对应域名请求可选 host 权限（optional host permissions）
- [x] 登录/退出：调用 `/api/auth/login` 与 `/api/auth/logout`
- [x] 同步：能拉取 `bookmarks/categories/pinned` 并缓存到 `chrome.storage.local`

**验收**：用户能在插件里完成登录，并看到“已同步”状态（哪怕 UI 很简陋）。

### M1：检索（核心高频）✅

- [x] Popup 搜索：基于同步快照的本地检索（标题/URL/描述）
- [x] 结果打开：点击结果通过 `chrome.tabs.create` 在新标签页打开
- [ ] 可选后续：omnibox `on <keyword>`

**验收结果（2026-03-12 通过）**：本地 localhost 环境，Popup 搜索框输入关键字后即时过滤结果，点击在新标签页打开链接正常；未匹配时显示"没有匹配的书签"。`Failed to fetch` 为 dev 服务未运行时的网络层报错，服务正常后同步与检索均正常。~~**技术债**：Popup 与 Options 均因 Vue 在当前 MV3 环境挂载失败，统一临时改为纯 HTML + 原生 JS 实现，后续排查后还原 Vue 版。~~ **已于 2026-03-12 完成 Vue 迁移，技术债清偿。**

### M2：置顶便利使用 ✅

- [x] 置顶区展示：从同步快照 `pinned` + `bookmarks` 还原置顶列表，按网页端顺序在 Popup 顶部以 favicon + 名称网格展示
- [x] 点击打开：点击置顶图标通过 `chrome.tabs.create` 在新标签页打开链接
- [ ] 置顶增删与排序（写回 `/api/data/pinned`）— 写入操作，后续评估并发风险后再做（目前仅展示，不支持修改）

**验收结果（2026-03-12 通过）**：置顶区图标顺序与网页端一致，点击置顶图标可在新标签页打开对应链接，搜索框正常工作。

### M3：快捷添加书签（快存）✅

- [x] 收藏当前页（Popup「+ 收藏」按钮）：URL 去重（已存在时提示），默认归入「未分类」分类，写入后本地缓存同步更新
- [x] 右键菜单「添加到 OmniNav」：Service Worker 接收 `contextMenus.onClicked` 事件，执行串行读-改-写，操作结果通过系统通知（`notifications`）反馈
- [ ] 收藏时分类选择 UI（默认未分类，选分类属于后续迭代）

**验收结果（2026-03-12 通过）**：
1. Popup「+ 收藏」正常，提示「✓ 已收藏：xxx」，搜索列表即时更新
2. 重复 URL 提示「该链接已存在，无需重复添加」
3. 右键菜单「添加到 OmniNav」正常，出现系统通知
4. 网页端刷新可见新增书签，KV 写入成功

### M4：AI 会话（便利对话）

- [x] 扩展独立页面（`ai.html`）：对话气泡 UI，用户消息/助手消息分左右布局
- [x] 轻量 Markdown 渲染：代码块、行内代码、加粗、斜体、列表、换行
- [x] 调用 `/api/ai/chat` 并展示 usage（提示词 / 补全 / 合计 tokens）
- [x] 错误态：未配置 AI 时提示引导用户前往网页端设置；网络/鉴权错误清晰展示
- [x] Popup「🤖 AI」按钮一键打开 AI 页面
- [x] 清空对话按钮，Enter 发送（Shift+Enter 换行），加载中三点动画

**验收结果（2026-03-12 通过）**：
1. Popup「🤖 AI」按钮正常，新标签页打开 AI 会话页
2. 发送问题后出现加载动画，AI 回复气泡正确渲染（含 Markdown 格式）
3. 底部 usage 条正确显示 token 用量
4. 「清空对话」按钮正常回到欢迎页
5. AI 未配置场景待后续验收（暂跳过）
- **技术修复**：`apiFetch` 将后端直接返回的 `{ ok, message, usage }` 整体作为 `ApiResponse`，`r.data` 为 `undefined`，导致气泡内容为空；修复为直接读 `r.message`。

---

## 9. 后期规划（高风险项集中在后期）

以下功能归入后期（Phase 2.5 / Phase 3），进入前必须谨慎评估：

- [ ] 增量写入/并发控制（新增端点或 ETag）
- [ ] AI 上下文“topK 注入”与 token 成本优化（可能需要新增 `chat-lite` 或可选上下文字段）
- [ ] 插件专用鉴权（Personal Access Token，可新增但不替换 cookie session）
- [ ] Firefox 适配与多浏览器一致性

---

## 10. 进度记录（持续更新区）

> 约定：每次完成一个里程碑或做出重要决策变更，都在此追加一条记录（日期 + 变更摘要 + 风险级别 + 影响面 + 回滚方案）。

- 2026-03-12：创建 Phase 2 开发计划文档（低风险）。后续将按“只新增不破坏”推进插件 MVP。
- 2026-03-12：M0 实践中发现 MV3 扩展页面 CSP 对 inline script 全禁（含 options/popup），导致早期诊断脚本被拦截；同时 Vue 驱动的 options 页在目标环境中无法正常挂载且 Console 无报错。当前为降低复杂度，临时采用「纯 HTML 配置页 + 极少量原生 JS」替代 Vue 版本，待后续在本地可复现环境下排查 Vue 入口与 DevTools 行为后再还原为 Vue 版本。（风险级别：低；影响面：仅限插件设置 UI 技术栈选择；回滚方案：随时恢复 Vue options entry 并删除临时页）
 - 2026-03-12：完成 M0 实际验收（本地 `http://localhost:5173`，通过插件设置页完成 baseUrl 配置、站点授权、登录与同步），并启动 M1 开发：在 Popup 中基于同步快照增加本地搜索框和结果列表（点击在新标签打开），暂不支持搜索结果中的置顶区分组与复杂排序。（风险级别：低；影响面：仅新增前端能力；回滚方案：可在 manifest 中暂时隐藏 Popup 搜索入口）
- 2026-03-12：完成 M1 实际验收（Popup 本地搜索 + 点击新标签打开链接正常，dev 服务在线时同步正常）。因 Vue 在 MV3 环境挂载失败，Popup 也统一改为纯 HTML + 原生 JS 实现，与 Options 保持一致（低风险技术债，后续还原 Vue）。
- 2026-03-12：启动并完成 M2 开发：Popup 顶部新增置顶区（`pinned` 顺序、favicon 网格、点击新标签打开）。置顶增删/排序属于写入操作，暂不实现，后续评估并发风险后再做。（风险级别：低；影响面：仅新增 Popup 前端展示；回滚方案：可隐藏置顶区 HTML 块）
- 2026-03-12：完成 M2 实际验收（置顶图标顺序、点击打开、搜索均正常）。启动并完成 M3 开发：Popup 新增「+ 收藏」按钮（URL 去重、默认未分类、写后刷新缓存），Service Worker 新增 `addBookmark` 消息处理与右键菜单「添加到 OmniNav」（操作结果通过系统通知反馈）。`notifications` 权限已加入 manifest。新增 `Bookmark` / `Category` 类型定义，`api.ts` 新增 `putBookmarks` 封装。（风险级别：低；影响面：新增 Popup 写操作与 SW 消息，未改动后端任何接口；回滚方案：可移除收藏按钮与 contextMenus 监听）
- 2026-03-12：完成 M3 实际验收（「+ 收藏」、URL 去重提示、右键菜单通知、网页端可见均正常）。启动并完成 M4 开发：`ai.html` 全量重写为原生 TS（去掉 Vue 依赖，与 Popup/Options 保持一致），实现对话气泡 UI、轻量 Markdown 渲染、usage 展示、AI 未配置引导、清空对话；Popup 新增「🤖 AI」按钮打开 ai.html 新标签页；构建产物去除 Vue 运行时，包体积大幅缩减。（风险级别：低；影响面：仅 ai.html 页面新增，未改动后端；回滚方案：可恢复旧占位页）
- 2026-03-12：完成 M4 实际验收（AI 对话、Markdown 渲染、usage 展示、清空对话均正常）。修复气泡内容为空的 Bug：`apiFetch` 将后端 `{ ok, message, usage }` 整体返回，`r.data` 为 `undefined`，修复为直接读 `r.message`。**Phase 2 四个核心里程碑（M0–M4）全部完成。**
- 2026-03-12：M4 后新增「收藏时 AI 自动分类 + 用户确认」功能：后端新增 `POST /api/ai/classify` 接口（低风险，只新增不改旧接口）；Popup 收藏流程改为「点+ 收藏 → AI 分类中 → 展示确认卡片（标题可编辑 + 分类下拉）→ 用户确认后写入」；`background/entry.ts` 的 `addBookmark` 消息支持传入 `categoryId`。（风险级别：低；影响面：新增后端接口 + Popup 交互流程增强；回滚方案：可在 Popup 跳过分类步骤直接写入）
- 2026-03-12：右键菜单改为二级结构：一级「添加到 OmniNav」→ 二级「自动分类」/ 「暂不分类」。「自动分类」调用 `/api/ai/classify` 后静默写入，系统通知显示分类名；「暂不分类」直接写入未分类。菜单名去除 emoji，保持简洁。（风险级别：低；影响面：仅 Service Worker contextMenus 注册与点击处理；回滚方案：可恢复为单级菜单）
- 2026-03-12：实现增量写入端点（阶段一）：后端新增 `POST /api/ext/bookmarks`，由后端负责读 KV → URL 去重 → 追加 → 写 KV，彻底消除客户端全量覆盖竞争风险；插件侧 `addBookmarkToKv` 改为调用新端点，移除本地"读-改-写"逻辑，本地缓存由返回的书签数据追加更新；旧的 `PUT /api/data/bookmarks` 保留不变，网页端无感知。写队列结构保留供后续 PATCH/DELETE 端点使用。（风险级别：中；影响面：新增后端端点 + 插件写入路径变更；回滚方案：插件侧可切回 `putBookmarks` 全量覆盖模式）
- 2026-03-12：改进同步机制：Popup 打开时先用本地缓存立即渲染，同时后台静默发起同步，成功后自动刷新界面，失败完全静默不打扰用户。决策：暂不实现定时后台同步（MV3 alarms 有资源开销、KV 读取计费增加，且「打开时自动同步」已覆盖主要使用场景；待有实际需求再评估）。Popup 布局同步调整：搜索栏移至置顶区上方，顶部四个操作按钮改为 Material Symbols 图标按钮（与网页版图标一致），底部新增「在网页版中管理书签」快捷入口。
- 2026-03-12：AI 对话改为 Side Panel 方式（B 方案）：manifest 新增 `side_panel` 声明（`default_path: ai.html`）及 `sidePanel` 权限，版本升至 1.0.2；Popup「AI」按钮直接在点击事件中调用 `chrome.sidePanel.open`（必须在用户手势同步上下文中调用，不可经由 Service Worker 消息转发），旧版 Chrome 降级回退至新标签页；`ai.html` 布局改为宽度 100% 自适应，适配侧边栏窄宽度。（风险级别：低；影响面：新增 manifest 声明 + 按钮行为变更；回滚方案：移除 side_panel 声明并恢复按钮为 `chrome.tabs.create`）
- 2026-03-12：修复 AI Side Panel 的 Markdown 渲染问题：替换原有自制正则渲染器，改为与网页版一致的 `marked` + `DOMPurify` 方案。原问题：自制渲染器先对文本执行 `escapeHtml` 再做正则匹配，导致 `Title | URL` 中的 `|` 被 HTML 转义后正则失效，URL 被截断（渲染为 `https://n/`），同时链接文本和 URL 错误拼接。新方案：`marked` 原生支持 autolink 与 Markdown 标准链接语法，`DOMPurify` 净化 HTML 并在 hook 中统一为所有 `<a>` 标签加 `target="_blank"`；`ai.html` 新增 `.md` CSS 类提供链接颜色、列表缩进、代码块背景等基础样式，与网页版视觉风格一致。（风险级别：低；影响面：仅 ai.html 渲染层；回滚方案：恢复旧 renderMarkdown 函数）
- 2026-03-12：多项 UI 细节优化：① 搜索结果每条增加分类徽章（紫色圆角标签，无分类则不显示）；② Popup 顶栏 Logo 文字前加入项目 logo 图片（22×22）；③ 浏览器工具栏/扩展管理页图标改为项目 logo（从 `logo.svg` 转换生成 16/32/48/128px PNG，写入 manifest `icons` 与 `action.default_icon`）；④ 搜索框高度加大（padding 9px，字号 13px）。（风险级别：低；影响面：仅 UI 层）
- 2026-03-12：Popup 与 AI Side Panel 适配系统深色模式（`prefers-color-scheme: dark`）：以 CSS 变量体系（`--bg`、`--text`、`--border` 等约 20 个语义变量）统一管理所有颜色，`@media (prefers-color-scheme: dark)` 覆盖变量值；`main.ts` 内联样式全部改用 CSS 变量，不再硬编码色值；深色下 AI 链接颜色适当调亮（`#818cf8`）以保持可读性，代码块保持 Catppuccin 深色主题不变。（风险级别：低；影响面：仅前端样式层，功能逻辑不变）
- 2026-03-12：**清偿 Vue 技术债**：将插件三个页面（options / popup / ai）从临时的纯 TS + DOM 命令式写法完整迁回 Vue 3 SFC + Composition API。`tsconfig.json` 补充 `jsx: preserve`；每个页面的 `main.ts` 精简为 3 行 `createApp(App).mount('#app')`；业务逻辑迁入对应 `App.vue`；Popup 拆分为 4 个组件（`App.vue` + `PinnedGrid.vue` + `SearchList.vue` + `ConfirmCard.vue`），状态由 `ref`/`computed` 驱动，父子通过 `props`/`emit` 通信；CSS 变量主题体系、`shared/` 工具层、`marked`+`DOMPurify` 等全部无缝复用；三个页面功能验收全部通过。原因：早期临时采用纯 DOM 写法是为降低 MV3 环境调试风险，现在稳定后完成还原。（风险级别：低；影响面：仅前端技术栈变更，功能行为不变；回滚方案：恢复旧 main.ts 内容即可）

