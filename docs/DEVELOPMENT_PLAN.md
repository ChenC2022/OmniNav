# OmniNav 开发计划

> 本文档随开发进度更新，用于对齐技术方案与迭代顺序。

**相关文档**：需求说明见同目录下 `OmniNav PRD.md`。

---

## 一、技术方案确认摘要

| 项 | 决策 |
|----|------|
| **部署** | Cloudflare Pages 一体：前端静态资源 + `functions/` 内 Hono 提供 `/api/*`，basePath 设为 `/api` 避免与静态路由冲突 |
| **持久化** | 仅用 **KV**，从开发阶段起直接接 KV，不做 LocalStorage/IndexedDB 再迁移 |
| **前端库** | Vue 3 + Vite + Pinia + VueUse + 拖拽库（见下文推荐） |
| **AI** | 兼容 OpenAI 格式的第三方 API；正式环境支持用户在设置中自行配置（provider / base_url / api_key / model）；不强制流式输出 |
| **天气** | **Open-Meteo**（免费、无需 API Key，适合个人非商用） |

---

## 二、技术选型与推荐

### 2.1 拖拽库

- **推荐**：**VueDraggable Next**（`vuedraggable` 的 Vue 3 版本，基于 Sortable.js）
  - 成熟、文档多，适合「书签图标」与「分类卡片」的拖拽排序
  - 安装：`npm i vuedraggable@next`
- 备选：**vue-draggable-plus**（Vue 3 原生、轻量），若后续需要更细粒度控制可考虑

### 2.2 天气 API：Open-Meteo

- 文档：https://open-meteo.com/en/docs
- 无需 API Key，前端或后端请求均可；建议由 **Hono 代理**（`/api/weather?lat=&lon=`）统一跨域与缓存
- 非商用使用符合许可（CC BY 4.0）

### 2.3 AI 配置（用户可配置）

- 存储：在 KV 的 `settings` 或单独 key 中存用户填写的 AI 配置（如 `api_key`、`base_url`、`model_name`、`provider` 等）
- 后端：Hono 的 `/api/ai/chat` 读取该配置，以 OpenAI 兼容方式转发请求；敏感字段（如 api_key）仅存于 KV，不暴露给前端
- 你当前提供的示例（Gemini 兼容端点）可作为默认或开发环境默认配置，便于联调

---

## 三、KV 数据结构（初版）

| Key | 用途 | 说明 |
|-----|------|------|
| `bookmarks` | 书签列表 | JSON 数组，含 id、title、url、description、categoryId、favicon、order、health 等 |
| `categories` | 分类列表 | JSON 数组，含 id、name、order、isPrivate、passwordHint 等；私密分类密码加密后存或另 key |
| `pinned` | 置顶书签 ID | 5–8 个常用链接的 id 列表，用于 Big Icons 区 |
| `settings` | 全局设置 | 主题、搜索默认引擎、AI 配置（base_url、model、api_key 存 KV 不返前端）、等 |
| （可选）`quotes` | 励志语录 | 若后端维护语录列表可放此处；否则前端静态列表即可 |

- 个人用户、单租户：暂不引入 `userId` 前缀；若未来多设备/多用户再扩展 key 设计。

---

## 四、API 设计（Hono，basePath `/api`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/PUT | `/api/data/bookmarks` | 书签列表读写（与 KV 同步） |
| GET/PUT | `/api/data/categories` | 分类列表读写 |
| GET/PUT | `/api/data/pinned` | 置顶 id 列表 |
| GET/PUT | `/api/data/settings` | 设置读写（返回时脱敏 api_key） |
| GET | `/api/favicon` | `?url=xxx`，代理 Favicon API |
| POST | `/api/check-url` | Body: `{ "url": "..." }`，返回可达性/状态码 |
| POST | `/api/extract-meta` | Body: `{ "url": "..." }`，抓取页面 title + meta description（自动归类深度分析用） |
| GET | `/api/weather` | `?lat=&lon=`，代理 Open-Meteo |
| GET | `/api/geocode` | `?name=xxx`，代理 Open-Meteo 地理编码搜索城市 |
| GET | `/api/reverse-geocode` | `?lat=&lon=`，逆地理编码获取城市名（Nominatim） |
| GET | `/api/bing-wallpaper` | 返回当日 Bing 壁纸 URL |
| POST | `/api/ai/chat` | Body: `{ "messages": [...] }`，用 KV 中 AI 配置转发，非流式 |

---

## 五、开发阶段划分

### Phase 1：项目骨架与基础设施 ✅

- 初始化 Vite + Vue 3 + TypeScript + Tailwind CSS v4（@tailwindcss/vite，无 PostCSS 单独配置）
- Cloudflare Pages 项目结构：根目录为前端，`functions/api/[[path]].ts` 下 Hono，basePath `/api`
- 配置 wrangler.toml（Pages + KV_OMNINAV 绑定），本地 `wrangler pages dev dist` 可访问前端与 `/api/*`
- Pinia Store 骨架：bookmarks、categories、settings、ui 已预留
- 布局框架：Header / Main（router-view）/ Drawer / Footer，响应式占位
- 主题：暗黑模式切换 + 跟随系统（class + Tailwind `dark:`），偏好通过 PUT/GET `/api/data/settings` 存 KV

### Phase 2：书签与分类（KV 直连）✅

- 书签 CRUD：列表展示、新增/编辑表单（标题、URL、描述、分类）、删除；与 KV 同步（useDataSync + saveBookmarks）
- 分类 CRUD：分类卡片增删改查，与 KV 同步（saveCategories）；CategoryForm 弹窗
- 置顶 Big Icons：常用区最多 16 个，可从分类书签置顶或**独立添加**（标题+URL，写入「未分类链接」分类并置顶），顺序与 KV `pinned` 同步；拖拽排序
- 拖拽：vuedraggable 用于置顶区、分类卡片列表、分类卡片内书签排序，写回 KV
- Favicon：`/api/favicon?url=xxx` 代理 Google Favicon，BookmarkIcon 内展示
- 链接健康检查：首页「检查链接」调用 `/api/check-url` 批量检测，结果写回 health（ok/warn/error），图标灰显/警告态

### Phase 3：搜索 ✅

- 顶部聚合搜索框：SearchBar 组件，**无前缀**为网页搜索（搜索引擎由右侧下拉选择，Google/Bing/百度/GitHub，defaultSearchEngine 存 settings）；**前缀 `@`** 为本地书签搜索（标题/URL/描述），下拉展示匹配结果，键盘上下 + Enter 打开
- **模式标签**：搜索框左侧药丸形标签显示当前模式（🌐 网页 / 🔖 书签），与主题主色一致；点击标签可在网页/书签模式间切换；**Tab 键**在聚焦输入框时也可切换模式
- **书签模式下隐藏搜索引擎**：仅在网页搜索模式显示「Google ▾」等引擎选择按钮与下拉；书签模式不显示，避免干扰
- ⌘K（或 Ctrl+K）：全局快捷键 + 头部「⌘K」按钮 → 聚焦搜索框并自动进入书签模式（`@ `），无独立 Spotlight 弹窗
- Drawer：头部「AI」按钮呼出侧边抽屉；抽屉内容为 Phase 4 AI 对话

### Phase 4：AI 对话 ✅

- 设置页：AI 配置表单（Base URL、Model、API Key），保存到 KV；PUT `/api/data/settings` 合并保留已有 api_key
- 后端：POST `/api/ai/chat` 从 KV 读 `settings.ai`，转发 OpenAI 兼容接口（非流式），未配置返回 400 + `AI_NOT_CONFIGURED`
- Drawer：ChatPanel 组件，消息列表、输入框、发送；未配置时提示前往设置，错误态展示 API 错误信息

### Phase 5：小组件 ✅

- 设置页：天气位置（可选 lat/lon）存 settings 并持久化
- Header：已有时钟、天气；天气优先使用设置中的经纬度，否则浏览器定位，否则默认北京

### Phase 6：个性化与数据 ✅

- 私密分类：Category 增加 `passwordHash`（SHA-256(categoryId+password)）；CategoryForm 可勾选私密、填密码与提示；CategoryCard 未解锁时显示锁与密码框，验证通过后解锁（unlockedIds 存 privateCategories store，仅会话有效）
- 背景：GET `/api/bing-wallpaper` 代理 Bing HPImageArchive 返回当日图 URL；设置项「默认背景 / Bing 每日一图」存 `settings.background`；App 根节点应用背景图（已取消全屏半透明遮罩）；顶栏、底栏、常用区与分类卡片等使用 `glass-translucent` 半透明玻璃样式以兼顾可读性与背景可见
- 导出/导入：设置页「导出 JSON」下载 bookmarks、categories、pinned、settings 与 exportedAt；「从 JSON 导入」选择文件后确认弹窗，确认后写入各 store 并 PUT 同步 KV（含配置）

### Phase 7：按 Web Design 完成页面调整 ✅

- **目标**：依据 `docs/Page Design/` 下的设计稿及设计对照表，完成页面视觉与布局的调整与对齐。
- **设计语言**：Inter 字体、Material Symbols 图标、主色靛蓝（#818cf8）、圆角与玻璃卡片（glass-translucent / glass-effect）；浅色/深色双模式一致。
- **范围**：Header（OmniNav、搜索/⌘K 与 AI Chat 按钮、时钟/天气/设置）、首页常用区与分类区（玻璃卡片、card-hover、右键菜单）、分类卡片（双列书签、悬停操作按钮）、设置页（左侧 sticky 锚点、返回首页、各区块卡片与输入框深色适配）、SearchBar（模式标签药丸形、书签下拉选中高亮、书签模式隐藏引擎选择）、AI 抽屉（400px、消息气泡与输入区）、Footer（同步文案、主题胶囊三选）。
- **已完成**：
  - Sun-Panel 风格：深色 mesh 渐变背景、玻璃拟态卡片、高圆角与 0.5px 白边；浅色柔和紫蓝渐变背景。
  - 深色模式统一：正文与标题类文字色 #94A3B8（`dark-text-94`），设置页、AI 抽屉、搜索框/主题切换等无白底、透明或半透明玻璃。
  - 搜索框下拉：底色完全不透明（浅色白、深色 #0f172a），悬浮高亮与选项对齐。
  - 右键与交互：分类/书签右键菜单、常用区置顶书签含书签时禁止删除分类等。
- **产出**：页面外观与设计语言统一，可交付验收；交互与数据流不变。

### Phase 8：打磨与收尾 ✅

- **响应式** ✅：平板、移动端布局与 Drawer 行为（小屏全宽、安全区、Header/Home/Settings 响应式）。
- **过渡动画** ✅：Drawer 滑入与背板使用 cubic-bezier/ease-out；首页「添加到常用」弹窗与右键菜单、分类卡片操作菜单使用 modal-fade / menu-pop（淡入 + 微缩放）；Settings 确认导入等使用全局 modal 淡入。
- **Footer** ✅：同步状态提示（「已与云端同步」/「同步中…」/「离线」）、主题胶囊与玻璃样式一致（glass-translucent），主题按钮带 aria-label。
- **励志语录/热搜占位** ✅：首页常用与分类间增加语录条，`src/data/quotes.ts` 静态随机语录，后续可接 API/热搜。
- **布局与宽屏自适应** ✅：主区域 max-width 1920px（A+C）；分类区支持 CSS 多列布局（`USE_COLUMN_LAYOUT`，窄屏 1 列至宽屏 5 列，卡片 `break-inside-avoid` 不截断），卡片高度由内容决定（`items-start`）；未分类区书签网格自适应列数（`auto-fill` + `minmax(min(100%,7rem),1fr)`）；回退时改 `USE_COLUMN_LAYOUT = false` 即可恢复 Grid 布局。
- **收尾** ✅：见 `docs/PRE_DEPLOY_CHECKLIST.md`（功能自测、无障碍与键盘导航、控制台与构建、环境配置）。
- **关于** ✅：设置页增加「关于」区块，展示应用简介、当前版本（来自 package.json）与主要功能列表。

### Phase 9：未分类与增强 ✅

- **未分类区域** ✅：首页在「分类」下方独立展示「未分类」区块（不进入分类网格）；分类名 `未分类`，兼容旧名「未分类链接」「快捷链接」并自动迁移；不可重命名、不可删除；卡片内不重复显示标题，头部为图标按钮（添加、导入、测速/清理失效、自动归类），圆角正方形、宽屏自适应。
- **添加** ✅：头部「添加」打开该分类的添加书签表单；独立添加的链接参与链接健康检查（添加时检查一次，全量「检查链接」时一并检查）。
- **导入** ✅：支持导入 Chrome、Edge、Firefox 等浏览器导出的书签 HTML 文件；`src/utils/parseBookmarkHtml.ts` 解析 Netscape 格式，去重（同 URL 不重复添加），写入「未分类」分类并保存；导入按钮支持加载态与结果提示。
- **清理失效** ✅：一键移除「未分类」中已标记为失效（`health === 'error'`）的链接；若该链接在常用置顶中会同步取消置顶并保存。
- **自动归类** ✅：点击「自动归类」先弹出预弹窗（显示待归类数量、可选「深度分析」）；开始分析后调用 `/api/extract-meta`（可选）抓取页面摘要，再调用 `/api/ai/chat` 获取归类建议（可建议新分类）；结果弹窗中可修改每条链接的目标分类或暂不归类，确认后批量更新 categoryId 并创建 AI 建议的新分类。
- **删除分类** ✅：删除非「未分类」的分类时，将该分类下的书签批量移入「未分类」，再删除分类；删除操作已改为 async 并 await 保存，保证持久化顺序。

### Phase 10：搜索统一与打磨 ✅

- **搜索统一** ✅：SearchBar 支持前缀 `@` 切换为书签搜索，书签结果以下拉形式展示；⌘K 聚焦搜索框并自动进入书签模式；已移除独立 Spotlight 组件；搜索引擎仅通过下拉选择，不再使用前缀指定。
- **搜索框体验** ✅：左侧药丸形模式标签（网页/书签）提示当前模式并可点击切换；Tab 键在输入框聚焦时切换网页/书签模式；书签模式下不显示搜索引擎选择（仅网页模式显示）；已移除搜索框内放大镜图标。

---

## 六、后续更新约定

- 每完成一个 Phase 或重要决策变更，在本文档对应处更新状态（如「Phase 1 ✅」）或补充说明
- 新增 API 或 KV key 时，在第三节、第四节同步更新
- 若引入新依赖或更换拖拽库/天气源，在第二节更新并注明原因

---

*文档创建日期：2025-02-28*
