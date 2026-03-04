# OmniNav · 个人 AI 智能驾驶舱

书签管理 + AI 助手一体的极简个人工作台，数据同步至 Cloudflare KV，支持自部署。

---

## 功能与特点

### 书签与分类

- **常用区**：置顶高频网站，无数量上限；展示区固定高度、超出可滚动。通过分类内书签右键「添加到常用」添加，编辑布局下拖拽把手排序。
- **分类卡片**：书签按分类展示，宽屏多列自适应。支持**私密分类**，密码解锁后可见。
- **拖拽排序**：编辑布局下，分类块、书签项均可拖拽排序；书签可跨分类拖拽移动。
- **未分类**：独立区域在分类下方，支持添加、导入 HTML、检测并清理失效链接、**AI 自动归类**；可从分类中拖放书签到未分类。
- **链接健康**：检测书签连通性，异常时图标显示状态点（灰/黄/绿）；支持批量清理失效链接。

### 搜索

- **聚合搜索**：位于常用与分类之间，支持**网页搜索**与**书签搜索**。输入 `@` 或点击模式标签切换书签模式，Tab 键可快速切换。
- **多引擎**：支持 Google、Bing、百度、DuckDuckGo、Yandex、GitHub，可在设置中切换默认引擎。
- **书签搜索**：本地按标题、URL、描述、分类名匹配，支持多关键词 AND 过滤，下拉选择后打开。

### AI 能力

- **AI 对话**：顶部栏入口打开右侧抽屉，与自配置大模型对话（需在设置中填写 Base URL、Model、API Key）。
- **AI 自动归类**：将未分类书签交由大模型判断，归入已有分类或建议新分类；支持深度分析（抓取网页摘要）。
- **AI 生成说明**：编辑分类时可一键让 AI 生成分类说明。
- **励志语**：顶部栏中部由大模型随机生成 12 条励志语，每 5 分钟自动轮播一条，点击可手动切换下一条。

### 设置

- **通用设置**：主题模式（跟随系统 / 浅色 / 深色）、默认搜索引擎、链接打开方式（新标签页 / 当前页面）。
- **AI 助手**：Base URL / Model / API Key 配置，一键测试连接验证配置有效性。
- **天气位置**：自动检测或手动搜索城市。
- **数据管理**：
  - **OmniNav JSON**：完整导出/导入（书签、分类、置顶、配置）。
  - **浏览器书签**：导入/导出标准 Netscape Bookmark HTML（Chrome / Edge / Firefox 通用），自动识别文件夹为分类。
  - **Sun-Panel 导入**：从 Sun-Panel 导出的 JSON 配置导入，自动映射分组为分类。
  - **清空数据**：一键清空所有数据并同步云端。

### 其他

- **云端同步**：书签、分类、置顶、设置存于 Cloudflare KV；同步状态展示在页面最底部。
- **响应式**：适配桌面与移动端；顶部栏与分类区按键样式统一（方形圆角、玻璃/靛蓝主色）。

---

## 技术栈

- **前端**：Vue 3 + Vite + Tailwind CSS v4 + Pinia + VueUse + vuedraggable
- **API**：Hono on Cloudflare Pages Functions
- **存储**：Cloudflare KV（`KV_OMNINAV`）

---

## 文档

- [需求 PRD](docs/OmniNav%20PRD.md)
- [开发计划](docs/DEVELOPMENT_PLAN.md)
- [部署到 Cloudflare](docs/DEPLOY_TO_CLOUDFLARE.md)
- [部署前自测](docs/PRE_DEPLOY_CHECKLIST.md)

---

## 本地开发

**环境**：建议 Node 18 或 Node 20。

```bash
# 安装依赖
npm install

# 首次需创建 KV 并配置 wrangler.toml
npx wrangler kv namespace create KV_OMNINAV
# 将输出的 id 填入 wrangler.toml 中 [[kv_namespaces]] 的 id
```

**启动（推荐）**：

```bash
npm run dev:all
```

浏览器打开终端中 Vite 输出的本地地址（如 `http://localhost:5173`）。前端请求 `/api` 会代理到 Wrangler Pages（8789）。

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

---

## 部署

```bash
npm run build
npx wrangler pages deploy dist
```

在 Cloudflare 控制台为 Pages 项目绑定 KV 命名空间 `KV_OMNINAV`。完整步骤见 [部署指南](docs/DEPLOY_TO_CLOUDFLARE.md)。
