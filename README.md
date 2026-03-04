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
- **书签搜索**：本地按标题、URL、描述匹配，下拉选择后打开。

### AI 能力

- **AI 对话**：顶部栏入口打开右侧抽屉，与自配置大模型对话（需在设置中填写 Base URL、Model、API Key）。
- **AI 自动归类**：将未分类书签交由大模型判断，归入已有分类或建议新分类。
- **励志语**：顶部栏中部由大模型随机生成 12 条励志语，每 5 分钟自动轮播一条，点击可手动切换下一条。

### 个性化与数据

- **主题**：顶部栏单图标按键循环切换「跟随系统 / 浅色 / 深色」。
- **天气**：顶部栏展示城市与实时天气，设置中可切换自动定位或手动选城。
- **导出 / 导入**：设置页支持 JSON 导出与导入（书签、分类、置顶、配置）；可加载演示数据或清空全部数据。
- **云端同步**：书签、分类、置顶、设置存于 Cloudflare KV；同步状态展示在页面最底部，随滚动查看。

### 其他

- **导入书签**：支持从 Chrome / Edge / Firefox 导出的书签 HTML 文件一键导入至未分类。
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

数据为空时，可在设置页「加载演示数据」追加示例分类与书签。

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
