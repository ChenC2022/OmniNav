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

然后点击 **Save and Deploy**，等待首次构建完成。

### 3. 绑定 KV 命名空间（必须）

API 依赖 `KV_OMNINAV` 存储书签、分类、置顶、设置等，未绑定则接口会返回 503。

**3.1 创建 KV 命名空间**

- 在 Dashboard 左侧进入 **Workers & Pages** → **KV**
- 点击 **Create namespace**
- 名称填：`KV_OMNINAV`（或任意，下面绑定时会选）
- 创建后记下 **Namespace ID**（或后面在绑定页从下拉框选择）

**3.2 在 Pages 项目中绑定**

- 进入 **Workers & Pages** → 你的 **Pages 项目（omninav）**
- 打开 **Settings** → **Functions** → **KV namespace bindings**
- 点击 **Add binding**
  - **Variable name**：`KV_OMNINAV`（必须与代码中 `c.env.KV_OMNINAV` 一致）
  - **KV namespace**：选择上一步创建的命名空间
- 保存

**3.3 重新部署使绑定生效**

- 进入 **Deployments**，在最新一次部署右侧点 **...** → **Retry deployment**  
  或：在本地执行一次 `git commit --allow-empty -m "trigger redeploy" && git push`，触发重新构建部署。

### 4. 访问站点

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

项目 `wrangler.toml` 中已配置 `KV_OMNINAV`。若你**从未**在本账号下创建过该命名空间，需要先创建并把 id 写入配置：

```bash
npx wrangler kv namespace create KV_OMNINAV
```

终端会输出类似：

```text
Add the following to your configuration file:
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

将 `wrangler.toml` 里 `[[kv_namespaces]]` 的 `id` 替换为上述输出中的 id（若你之前已创建并填过，可跳过）。

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

### 主人密码（单用户对外暴露时必配）

- **作用**：未配置时所有 API 免鉴权（便于本地开发）；配置后需在登录页输入该密码才能访问书签/分类/设置等。
- **部署**：在 Pages 项目 **Settings** → **Environment variables** 中新增变量 `OMNINAV_OWNER_PASSWORD`，值填你的密码，并勾选 **Encrypt**（作为 Secret）。或使用 `wrangler secret put OMNINAV_OWNER_PASSWORD` 为该项目设置。
- **本地**：在项目根目录创建 `.dev.vars`（已加入 .gitignore），内容一行：`OMNINAV_OWNER_PASSWORD=你的密码`。不创建则本地请求不鉴权，可直接访问。
- **流程**：首次打开站点若已配置密码，会先进入登录页；输入正确密码后进入首页，之后 Cookie 有效期内无需再登。Header 右侧有「退出登录」可清除会话。

---

## 七、参考

- [Cloudflare Pages - Connect to Git](https://developers.cloudflare.com/pages/get-started/git-integration/)
- [Pages Functions - KV bindings](https://developers.cloudflare.com/pages/functions/bindings/)
- [Pages Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)
- 项目内：[PRE_DEPLOY_CHECKLIST.md](./PRE_DEPLOY_CHECKLIST.md)（部署前自测清单）
