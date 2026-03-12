# OmniNav 安全性改进方案

本文档基于当前代码与架构，梳理已做的安全措施、现存风险，以及改进方向与优先级。**访问控制已选定**：单用户、对外暴露，采用 **应用内主人密码** 方式。

---

## 一、项目与目标场景

- **形态**：个人 AI 智能驾驶舱（书签 + 分类 + 置顶 + 设置 + AI 对话等），前端 Vue 3，后端 Hono on Cloudflare Pages Functions，存储为单 KV 命名空间 `KV_OMNINAV`。
- **数据模型**：单租户、单用户/单实例（一个 Pages 部署对应一个 KV，无多用户账号体系）。
- **目标场景**：**单用户、对外暴露** —— 站点可能被公网访问（如 `xxx.pages.dev` 或自有域名），仅允许“主人”读写数据。
- **采用方式**：**应用内主人密码** —— 在 Worker 中校验主人密码（wrangler secret），通过后下发会话（cookie 或 JWT），所有敏感 API 需携带有效会话方可访问；并配合 SSRF 防护、登录限流等。

---

## 二、当前已做得较好的点

| 项目 | 说明 |
|------|------|
| **AI API Key 不落前端** | Key 存 KV，仅后端 `/api/ai/chat` 使用；GET `/api/data/settings` 返回时已脱敏 `apiKey`，PUT 时保留已有 key 不覆盖。 |
| **无 v-html 渲染用户内容** | 书签标题、URL、分类名等均用 Vue 模板 `{{ }}` 渲染，依赖 Vue 默认转义，XSS 风险较低。 |
| **私密分类密码不明文存储** | 前端用 SHA-256(categoryId + '\0' + password) 后只存 hash，KV 中无明文密码。 |
| **KV 未定义时的防御** | API 中检查 `c.env.KV_OMNINAV`，未定义时返回 503，避免运行时报错。 |
| **URL 解析** | favicon / extract-meta / check-url 等均用 `new URL()` 解析，格式不合规会 400。 |
| **超时与错误处理** | 对外 fetch（favicon、extract-meta、check-url）有超时和 try/catch，避免长时间挂起。 |

---

## 三、主要风险与改进方向

### 1. API 无认证（高）—— 已采用：应用内主人密码

**现状**：所有 `/api/*`（含 `/api/data/*`、`/api/admin/*`、`/api/ai/chat` 等）均无认证。任何人只要知道站点地址，即可读写书签/分类/置顶/设置，并可调用管理接口。

**影响（对外暴露时）**：  
- 数据可被任意读取、篡改、清空；AI 配置与书签完全暴露。  
- 管理接口可被恶意调用（如批量删除未分类书签）。  
- 若不加固，不适合以公网 URL 长期使用。

**采用方案：应用内主人密码**（已确定）

- **配置**：在 wrangler secret 中配置 `OMNINAV_OWNER_PASSWORD`（主人密码，仅部署者知晓）。
- **登录接口**：新增 `POST /api/auth/login`，请求体 `{ "password": "..." }`。校验通过后设置 **HttpOnly、Secure、SameSite=Strict** 的 session cookie，或返回短期 JWT（前端存内存或非 httpOnly cookie，请求时放在 `Authorization` header）。
- **鉴权范围**：所有敏感接口（`/api/data/*`、`/api/admin/*`、`/api/ai/*`）增加鉴权中间件，未带有效 cookie/Token 则 401。
- **可选放行**：`/api/favicon`、`/api/weather`、`/api/geocode`、`/api/reverse-geocode` 等只读代理可排除在鉴权外，便于未登录时也能打开登录页并加载部分资源；`/api/extract-meta`、`/api/check-url` 建议保护，避免未授权滥用。
- **前端**：首次加载若未带有效会话，展示登录页；输入密码调用 login，成功后写入 cookie 或携带 token，再正常调用数据接口；收到 401 时跳转或展示登录页。
- **安全要求**：登录失败必须做按 IP 限流（见下文「限流」），防止暴力破解。

*（若将来希望零应用改造，可改为在站点前加 [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) 做边缘门禁，届时可不再依赖应用内密码。）*

---

### 2. 管理接口未保护（中）

**现状**：`POST /api/admin/cleanup-uncategorized` 无鉴权，任何人可调用，会随机保留 30 条未分类书签并删除其余。

**改进**：与「1. API 认证」统一：admin 与 data/ai 一起纳入主人密码鉴权中间件，未登录请求返回 401。

---

### 3. SSRF（服务端请求伪造）（中）

**现状**：  
- `/api/favicon?url=...`、`POST /api/extract-meta`、`POST /api/check-url` 接受任意 URL，由 Worker 向该 URL 发起 fetch。  
- 未禁止内网、本地或云元数据地址，可能被用来探测内网或读取云环境元数据（如 169.254.169.254）。

**改进**：  
- 在解析出 `url.hostname` / `url.host` 后，增加“允许列表”或“禁止列表”校验，例如：  
  - 禁止：`localhost`、`127.0.0.1`、`0.0.0.0`、`169.254.169.254`、`10.x.x.x`、`192.168.x.x`、`172.16–31.x.x`、`[::1]` 等；  
  - 或只允许：公网 hostname（非 IP 或非内网 IP）。  
- 可写一个共用工具函数 `isUrlAllowed(url: URL): boolean`，三处接口在 fetch 前都调用，不通过则 400。

---

### 4. 私密分类密码哈希强度（低～中）

**现状**：使用 SHA-256(categoryId + '\0' + password)，无盐、无慢哈希，对弱密码易受彩虹表/暴力破解。

**改进**：  
- 若希望提升抗破解能力，可改为在前端使用 **PBKDF2 或 scrypt**（或后端若将来参与校验则在后端做），加随机盐并迭代；盐可随 hash 一起存（如 `salt:hash`）。  
- 需要兼容已有仅 SHA-256 的旧数据：可保留“若未检测到盐则按旧逻辑校验”的兼容路径，新设密码用新算法。

---

### 5. 请求体与 KV 写入（低）

**现状**：PUT body 仅做“是否为数组/对象”的校验，未限制 key 数量、字符串长度、嵌套深度等，极端情况下可能写入超大 value，影响 KV 成本与性能。

**改进**：  
- 对 bookmarks/categories 做简单 schema 或长度限制（如单条 bookmark 的 title/url 长度上限、数组最大长度）；  
- 在 PUT 前做校验，超限则 400。  
- 可选：对 settings 的 key 做白名单，只允许已知字段写入，避免塞入任意大对象。

---

### 6. CORS（低）

**现状**：未在 Hono 中显式设置 CORS。同源访问时通常无问题；若未来用独立前端域名或跨域调用，可能被浏览器拦截。

**改进**：  
- 若确定会跨域（例如前端在 A 域名、API 在 B 域名），在 Hono 中为 `/api` 增加 CORS 中间件，按需限制 `Origin`（如只允许自己的前端域名）。  
- 若始终同源，可仅做文档说明，暂不实现。

---

### 7. 限流（单用户对外暴露时建议）

**背景**：对外暴露后，登录接口与写接口可能被暴力尝试或滥用，需限制请求频率。

**改进**：  
- **登录接口**：`POST /api/auth/login` 必须做限流（如每 IP 每分钟最多 N 次失败），防止密码暴力破解。可用 Cloudflare [Rate Limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/) 在边缘配置，或应用内用 KV 按 IP 计数（Workers 无内存计数，需写 KV 或 D1）。  
- **写接口与代理接口**：对 `PUT /api/data/*`、`POST /api/admin/*`、`/api/favicon`、`/api/extract-meta`、`/api/check-url` 等可按 IP 或已认证身份做宽松限流，降低滥用与 DoS 风险。  
- **实现顺序**：与主人密码一并落地时，优先为 login 配置限流；其余可按需加。

---

### 8. 依赖与供应链（持续）

**建议**：  
- 定期 `npm audit`，对 high/critical 依赖做升级或缓解；  
- 部署前在 CI 中跑一次 audit（可选：`npm audit --audit-level=high` 失败则阻断部署）。

---

## 四、建议优先级（单用户、对外暴露）

| 优先级 | 项 | 说明 |
|--------|----|------|
| **P0** | **访问控制（1 + 2）** | 实现 **应用内主人密码**：`POST /api/auth/login`、登出（可选）、鉴权中间件保护 `/api/data/*`、`/api/admin/*`、`/api/ai/*`；未登录返回 401，前端登录页与 401 处理。 |
| **P1** | **SSRF 防护（3）** | 对 favicon / extract-meta / check-url 的 URL 做“禁止内网与元数据地址”校验，实现简单、风险明确。 |
| **P1** | **登录限流（7）** | 对 `POST /api/auth/login` 做按 IP 限流，防止暴力破解；与 P0 一并实现。 |
| P2 | PUT body 与 KV 的合理限制（5） | 防止滥用与成本激增。 |
| P2 | 私密分类密码算法升级（4） | 提升抗破解能力，可带兼容旧数据。 |
| P2 | 写接口/代理接口限流（7） | 按需对 PUT、extract-meta、check-url 等做宽松限流。 |
| P3 | CORS（6）、依赖审计（8） | 按实际部署方式与运维习惯排期。 |

---

## 五、后续可补充的内容

- **主人密码实现说明**：可单独写一版“登录与鉴权实现说明”，包含：`POST /api/auth/login` 与登出（可选）的请求/响应格式、cookie 名称与属性（或 JWT 方案）、鉴权中间件对哪些路径生效、前端登录页与 401 时的跳转/展示逻辑、以及登录失败限流规则（如每 IP 每分钟最多 5 次）。  
- **部署文档**：在 `DEPLOY_TO_CLOUDFLARE.md` 中增加“主人密码”小节：配置 `OMNINAV_OWNER_PASSWORD`（wrangler secret）、首次访问与登录流程说明。  
- **完成 SSRF 与 body 校验后**：在 `PRE_DEPLOY_CHECKLIST.md` 或本文件中增加“安全自检项”（如：禁止内网 URL、PUT 限制是否生效、登录限流是否生效）。  
- 若未来演进为多租户（多人共用同一部署），再单独写“多租户与认证设计”文档，并调整 KV key 设计与路由鉴权。
