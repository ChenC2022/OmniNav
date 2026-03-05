# OmniNav 部署到 Cloudflare 指南

本文档说明如何将 OmniNav 部署到 **Cloudflare Pages**（前端静态资源 + `functions/api` 提供 `/api/*`，KV 存储书签/分类等数据）。

---

## 一、前置条件

- 已拥有 [Cloudflare 账号](https://dash.cloudflare.com/sign-up)
- 本地已安装 **Node.js 18+** 和 **npm**
- 项目已能本地正常运行（`npm run dev:all` 无报错）

---

## 二、部署方式概览

| 方式 | 适用场景 | 说明 |
|------|----------|------|
| **A. GitHub 集成** | 推荐，每次 push 自动构建部署 | 在 Cloudflare Dashboard 连接仓库，配置构建与 KV 绑定 |
| **B. Wrangler CLI** | 本地一键部署、脚本/CI 部署 | 在项目目录执行 `npm run deploy` |

任选其一即可；若希望「推代码即上线」，选 **A**。

---

## 三、方式 A：通过 GitHub 集成部署（推荐）

### 1. 创建 Pages 项目并连接 GitHub

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 左侧进入 **Workers & Pages**
3. 点击 **Create application** → **Pages** → **Connect to Git**
4. 选择 **GitHub**，按提示授权 Cloudflare 访问你的 GitHub
5. 选择仓库：**ChenC2022/OmniNav**（或你实际使用的仓库名）
6. 点击 **Begin setup**

### 2. 配置构建

在 **Build configuration** 中填写：

| 配置项 | 值 |
|--------|-----|
| **Project name** | `omninav`（或任意名称，将作为 `*.pages.dev` 子域名） |
| **Production branch** | `main` |
| **Framework preset** | None（或选 Vite，若识别正确可保留默认） |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| **Root directory** | 留空（项目在仓库根目录） |

环境变量（可选，如需在构建时区分环境可加）：

- 例如：`NODE_VERSION` = `20`

然后点击 **Save and Deploy**。**建议在首次构建前**完成下方 KV 绑定，否则首次部署可能成功但 API 会返回 503。

### 3. 绑定 KV 命名空间（必须，在 Dashboard 配置）

项目不在 `wrangler.toml` 中写死 KV id，避免新用户 id 不一致导致部署失败。请在 **Dashboard** 中配置：

**3.1 创建 KV 命名空间**

- 在 Dashboard 左侧进入 **Workers & Pages** → **KV**
- 点击 **Create namespace**
- 名称填：`omninav-KV_OMNINAV`（或任意，下面绑定时会选）
- 创建后记下 **Namespace ID**（或后面在绑定页从下拉框选择）

**3.2 在 Pages 项目中绑定**

- 进入 **Workers & Pages** → 你的 **Pages 项目（omninav）**
- 打开 **Settings** → **Bindings**
- 点击 **Add** → 选择 **KV namespace**
  - **Variable name**：`KV_OMNINAV`（必须与代码中 `c.env.KV_OMNINAV` 一致）
  - **KV namespace**：选择上一步创建的命名空间
- 保存

**3.3 使绑定生效**

- 若在首次部署**之前**已添加绑定，首次构建完成后即可使用。
- 若在首次部署**之后**才添加，进入 **Deployments** → 最新部署右侧 **...** → **Retry deployment**。

### 4. 密码方式（二选一）

**方式 A：首次访问者设密**（默认，零配置）

不配置 `OMNINAV_OWNER_PASSWORD`。首次打开站点时，访问者会看到「首次使用，请设置密码」表单，设置后即可登录使用。**注意**：公网部署时，第一个访问者将获得设密权，请确保你是首个访问者或部署在可信环境。

**方式 B：部署密码**

- 进入 **Workers & Pages** → 你的 **Pages 项目（omninav）**
- 打开 **Settings** → **Environment variables**
- 点击 **Add variable** → **Encrypt**（作为 Secret）
  - **Variable name**：`OMNINAV_OWNER_PASSWORD`
  - **Value**：你的主人密码
- 选择 **Production**（及 Preview 如需要）后保存

配置后首次登录使用该密码，并可选择在应用内设置新密码。保存后需**重新部署**使配置生效。

### 5. 访问站点

- 部署完成后，在 **Deployments** 中会看到 **View site** 链接
- 默认地址形如：`https://omninav-<随机>.pages.dev` 或 `https://<project-name>.pages.dev`
- 可在 **Custom domains** 中绑定自己的域名

---

## 四、方式 B：通过 Wrangler CLI 部署

### 1. 登录 Cloudflare

在项目根目录执行：

```bash
npx wrangler login
```

浏览器会打开 Cloudflare 授权页，完成登录。

### 2. 确认 KV 命名空间

部署后需在 Cloudflare Dashboard 中为 Pages 项目绑定 KV（同方式 A 的步骤 3）。CLI 部署不会自动创建绑定。

### 3. 执行部署

```bash
npm run deploy
```

该命令会依次执行：

1. `vite build`：构建前端到 `dist`
2. `wrangler pages deploy dist`：将 `dist` 与根目录下的 `functions/` 一起部署到 Cloudflare Pages

首次部署时，Wrangler 会使用 `wrangler.toml` 中的 `name`（如 `omninav`）创建或关联 Pages 项目，并带上其中的 `kv_namespaces` 绑定。

### 4. 查看结果

- 终端最后会输出 **Preview** 或 **Production** 的访问 URL
- 也可在 Dashboard：**Workers & Pages** → 选择该项目 → **Deployments** 查看

若 API 返回 503 且提示 "KV not available"，请回到 **方式 A 的步骤 3** 在 Dashboard 中为该 Pages 项目绑定同名 `KV_OMNINAV`（CLI 部署时若未自动带上绑定，需在 Dashboard 补绑）。

---

## 五、部署后检查

1. **首页**：能打开，常用/分类/未分类区域正常。
2. **设置页**：能保存并生效（说明 KV 读写正常）。
3. **数据持久化**：刷新或重新打开，书签/分类仍存在（说明 KV 绑定正确）。
4. **控制台**：无 503 或 CORS 报错。

若在 **GitHub 集成** 下部署，可在 **Deployments** 中查看构建日志；若用 **CLI** 部署，可再执行一次 `npm run deploy` 查看是否有报错。

---

## 六、可选：自定义域名与敏感配置

- **自定义域名**：在 Pages 项目 **Settings** → **Custom domains** 中添加域名并按提示在 DNS 中添加 CNAME。
- **敏感配置**（如 AI API Key）：不要写进前端代码或仓库。可存于 KV（由设置页写入并仅通过 API 读取），或使用 [Workers/Pages 的 Environment variables / Secrets](https://developers.cloudflare.com/pages/functions/bindings/#environment-variables) 在 Dashboard 中配置，在 `functions` 中通过 `context.env` 使用。

### 主人密码（本地开发）

在项目根目录创建 `.dev.vars`（已加入 .gitignore），内容一行：`OMNINAV_OWNER_PASSWORD=你的密码`。不创建则本地使用首次访问者设密流程。生产环境配置见上方 **步骤 4**。

---

## 七、参考

- [Cloudflare Pages - Connect to Git](https://developers.cloudflare.com/pages/get-started/git-integration/)
- [Pages Functions - KV bindings](https://developers.cloudflare.com/pages/functions/bindings/)
- [Pages Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)
- 项目内：[PRE_DEPLOY_CHECKLIST.md](./PRE_DEPLOY_CHECKLIST.md)（部署前自测清单）
