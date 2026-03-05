# 安全性改进 · 变更分步计划与实现方式

本文档将《安全性改进方案》中的 P0、P1 拆解为可执行的步骤，并说明每步的实现方式。**确认本计划后再按步实施代码改动。**

**已确认选项**：会话方案 = Cookie + KV session；登出 = 实现步骤 1.4；限流 = 5 次/分钟、窗口 60 秒，不配置化。**401 处理 = 方案 B**：路由守卫 + 登录态检查（`GET /api/auth/me`），未登录直接进登录页；并配合封装 fetch 在 401 时跳转，处理会话过期。

---

## 进度跟踪

| 阶段 | 状态 | 完成说明 |
|------|------|----------|
| **一、后端登录与会话** | ✅ 已完成 | Bindings、POST/GET /auth/login、/auth/me、/auth/logout，requireAuth 中间件，公开路由 favicon/weather/geocode/reverse-geocode，其余保护 |
| **二、后端登录限流** | ✅ 已完成 | 5 次/分钟、60 秒窗口，KV 计数，429 与成功时删 key |
| **三、前端登录与 401** | ✅ 已完成 | Login.vue、/login 路由、requiresAuth、路由守卫调 /api/auth/me、apiFetch 封装及敏感接口替换、Header 退出登录 |
| **四、SSRF 防护** | ✅ 已完成 | isUrlAllowed 禁止内网/元数据；favicon、extract-meta、check-url 三处校验 |

---

## 密码方式说明

**方式 A：首次访问者设密**（默认）

未配置 `OMNINAV_OWNER_PASSWORD` 时，首次打开站点会显示「首次使用，请设置密码」表单，由访问者设置密码后即可登录。密码哈希存于 KV（`auth:password_hash`）。**注意**：公网部署时，第一个访问者将获得设密权。

**方式 B：部署密码**

配置 `OMNINAV_OWNER_PASSWORD` 时，首次登录使用该密码；可选择在应用内设置新密码（存 KV），之后登录用应用内密码。环境变量仅作为“尚未设置过新密码时”的校验来源。

---

## 重置为首次部署状态（测试首次登录）

若要重新体验「首次登录 → 提示设置新密码」的流程，需删除 KV 中与主人密码相关的两个 key：

- `auth:password_hash`：用户设置后的密码哈希（删除后登录会改用 `OMNINAV_OWNER_PASSWORD`）
- `auth:first_login_done`：是否已完成首次设置（删除后登录成功会返回 `firstLogin: true`）

**重要**：重置后，若配置了 `OMNINAV_OWNER_PASSWORD` 则用其登录；若未配置，由首次访问者重新设密。

### 本地开发（wrangler pages dev）

本地使用**模拟 KV**，`wrangler kv key delete` 只影响**远程** KV，不会清掉本地状态。推荐用接口重置：

1. 已登录状态下，调用 **POST /api/admin/reset-auth-state**，请求体：`{ "password": "当前登录所用密码" }`（若你曾在应用里改过密码，就填改后的密码；否则填 `.dev.vars` 里的主人密码）。
2. 退出登录（或清除本站 Cookie）。
3. 使用 `.dev.vars` 中的主人密码（如 `test123`）再次登录，即可看到「首次登录，请设置新密码」。

### 生产 / 远程 KV

**方式一：Wrangler CLI**

在项目根目录执行（将 `<NAMESPACE_ID>` 替换为你的 KV 命名空间 id）：

```bash
npx wrangler kv key delete "auth:password_hash" --namespace-id=<NAMESPACE_ID>
npx wrangler kv key delete "auth:first_login_done" --namespace-id=<NAMESPACE_ID>
```

KV 命名空间 id 可从 Dashboard（Workers & Pages → KV → 选择命名空间查看）或执行 `npx wrangler kv namespace list` 获取。

**方式二：Cloudflare Dashboard**

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **KV**。
2. 找到绑定到本项目的 KV 命名空间。
3. 在 key 列表中删除 `auth:password_hash` 和 `auth:first_login_done`。

**方式三：已登录时用接口重置**

与本地相同：已登录状态下调用 **POST /api/admin/reset-auth-state**，请求体 `{ "password": "当前登录所用密码" }`，然后退出登录，再用**部署时配置的主人密码**（Cloudflare Secret）登录。

完成后：退出登录（或清除站点 Cookie），使用**部署时配置的主人密码**登录，即可再次看到「首次登录，请设置新密码」的流程。

### 本地开发：忘记曾设置的新密码时

若本地曾设置过新密码且已忘记，无法登录也就无法调用 `reset-auth-state`。可清空本地模拟 KV 后重启：

```bash
# 在项目根目录执行，然后重新启动 wrangler pages dev
rm -rf .wrangler/state
```

重启后本地 KV 为空，登录将使用 `.dev.vars` 中的主人密码，且会再次出现「首次登录，请设置新密码」。

---

## 一、总体顺序与依赖

```
阶段一：后端登录与会话
  → 阶段二：后端登录限流
  → 阶段三：前端登录与 401 处理
  → 阶段四：SSRF 防护
  → （后续）P2/P3 按需排期
```

阶段一、二、三构成完整的「主人密码」能力；阶段四独立，可与阶段三并行或在其后。

---

## 二、阶段一：后端登录与会话

**目标**：实现 `POST /api/auth/login`、鉴权中间件，保护所有敏感 API；未登录请求返回 401。

### 步骤 1.1：扩展 Bindings，实现登录接口

**改动文件**：`functions/api/[[path]].ts`

**实现方式**：

1. **Bindings**：在类型中增加 `OMNINAV_OWNER_PASSWORD: string`（可选，未配置时视为“未开启鉴权”，便于本地开发不设 secret 时仍可访问）。
2. **POST /api/auth/login**：
   - 请求体：`{ "password": "xxx" }`，Content-Type: application/json。
   - 若未配置 `OMNINAV_OWNER_PASSWORD`：返回 503 或 501，提示“未配置主人密码”。
   - 校验：`password === c.env.OMNINAV_OWNER_PASSWORD`（常量时间比较更佳，可用 `crypto.timingSafeEqual` 若环境支持，或简单比较）。
   - 成功：采用 **Cookie 方案**（推荐，同源下前端无需改请求方式）：
     - 生成一个随机 session 值（如 `crypto.randomUUID()`），写入 KV，key 如 `session:${sessionId}`，value 可为 `1` 或过期时间戳，TTL 如 7 天（KV 的 `expirationTtl`）。
     - 设置响应 Set-Cookie：`omninav_session=${sessionId}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`（7 天）。
     - 返回 `{ "ok": true }`，状态码 200。
   - 失败：返回 `{ "ok": false, "error": "Invalid password" }`，状态码 401。
3. **会话存储**：用 KV 存 session 有效性。key：`session:${sessionId}`，value：占位（如 `"1"`），`expirationTtl: 604800`（7 天）。这样无需在 Worker 里维护状态，且支持多实例。

**可选（JWT 方案）**：若希望无状态、不占 KV，可改为签发 JWT（payload 含 `{ sub: "owner", exp, iat }`），密钥存 secret，登录成功时返回 `{ "ok": true, "token": "..." }`，前端存 token 并在请求头带 `Authorization: Bearer <token>`；鉴权中间件则校验 JWT。本计划以 **Cookie + KV session** 为主方案，JWT 可作为替代在步骤 1.2 中二选一。

---

### 步骤 1.2：鉴权中间件与“已登录”判断

**改动文件**：`functions/api/[[path]].ts`

**实现方式**：

1. **从请求中取会话**：
   - Cookie 方案：从 `c.req.header('Cookie')` 中解析 `omninav_session`，得到 `sessionId`；用 `kv.get('session:' + sessionId)` 判断是否存在，存在即视为已登录。
   - JWT 方案：从 `Authorization: Bearer <token>` 取 token，用密钥校验签名与 exp，通过即已登录。
2. **鉴权中间件**：新建 `requireAuth` 中间件（或内联函数）：若未配置 `OMNINAV_OWNER_PASSWORD` 则直接 `next()`（不鉴权）；否则检查“已登录”，未登录则 `return c.json({ ok: false, error: 'Unauthorized' }, 401)`，已登录则 `next()`。
3. **放行路径**：以下路径**不**经过鉴权中间件：
   - `POST /api/auth/login`
   - `GET /api/favicon`、`GET /api/weather`、`GET /api/geocode`、`GET /api/reverse-geocode`（未登录时登录页或首页可能用到）
4. **保护路径**：以下路径**必须**经过鉴权（未登录 401）：
   - `GET /api/auth/me`（方案 B 路由守卫用）
   - `GET/PUT /api/data/bookmarks`
   - `GET/PUT /api/data/categories`
   - `GET/PUT /api/data/pinned`
   - `GET/PUT /api/data/settings`
   - `POST /api/admin/cleanup-uncategorized`
   - `POST /api/ai/chat`
   - `POST /api/extract-meta`
   - `POST /api/check-url`

**路由结构建议**：  
- 用 Hono 的 `app.route('/data', dataRoutes)` 与中间件挂载，或对 `/api` 下所有非白名单路径统一加 `app.use('*', requireAuth)` 再在内部排除 login 与上述只读代理（通过路径判断）。  
- 具体：先 `app.post('/auth/login', loginHandler)`，再 `app.use('*', requireAuth)`（在 requireAuth 内对 `c.req.path === '/api/auth/login'` 或 `/favicon`、`/weather` 等直接 `next()`），再挂载其余路由。

---

### 步骤 1.3：将鉴权应用到所有需保护的路由

**改动文件**：`functions/api/[[path]].ts`

**实现方式**：

- 确保所有在「保护路径」中的 handler 都在鉴权之后执行（即经过 `requireAuth`）。  
- 若当前是扁平定义（如 `app.get('/data/bookmarks', ...)`），可改为：  
  - 定义 `const protected = new Hono().use(requireAuth)`，然后 `protected.get('/data/bookmarks', ...)` 等，最后 `app.route('/', protected)`；  
  - 或保留现有结构，在 app 上全局 `app.use('*', requireAuth)`，在 requireAuth 内对白名单路径（login、favicon、weather、geocode、reverse-geocode）直接 `return next()`。  
- 本地开发：当 `OMNINAV_OWNER_PASSWORD` 未设置时，requireAuth 直接 `next()`，便于不配置 secret 也能跑通。

---

### 步骤 1.4：登出接口

**改动文件**：`functions/api/[[path]].ts`

**实现方式**：

- `POST /api/auth/logout`（或 GET 也可）：从请求中读取当前 sessionId（Cookie），删除 KV 中 `session:${sessionId}`；并设置 Set-Cookie 清除 `omninav_session`（`Max-Age=0` 或同 key 的 empty）。返回 `{ "ok": true }`。

---

### 步骤 1.5：登录态检查接口（方案 B 用）

**改动文件**：`functions/api/[[path]].ts`

**实现方式**：

- 新增 `GET /api/auth/me`：**需经鉴权中间件**（即带有效 Cookie 才可访问）。通过则返回 `{ "ok": true }`，状态码 200；未带有效会话或 session 已失效则返回 401。用于前端路由守卫在进入受保护页面前判断“是否已登录”，无需在前端维护本地登录标记。

---

## 三、阶段二：后端登录限流

**目标**：对 `POST /api/auth/login` 按 IP 限流，防止暴力破解。

### 步骤 2.1：登录接口限流

**改动文件**：`functions/api/[[path]].ts`

**实现方式**：

1. **限流 key**：用 KV 存“某 IP 在最近 1 分钟内失败次数”。key：`ratelimit:login:${ip}`，value：数字字符串（如 `"3"`），TTL 60 秒。IP 从 `c.req.header('CF-Connecting-IP')` 或 `X-Forwarded-For` 取（Cloudflare 会注入 CF-Connecting-IP）。
2. **逻辑**：在 login  handler 内、校验密码之前：
   - 若该 IP 对应 key 存在且 `>= N`（如 5），直接返回 429，`{ "ok": false, "error": "Too many attempts" }`。
   - 若密码校验**失败**：对该 key 做“加 1”（KV 的 get 后 put，value = parseInt(old, 10) + 1），TTL 60；若 key 不存在则从 1 开始。
   - 若密码校验**成功**：可删除该 key（可选），避免成功登录后仍占着计数。
3. **参数**：最大失败次数 N、窗口 60 秒可在代码中写死（如 5 次/分钟），后续若要配置可再抽成常量或 env。

---

## 四、401 处理方式对比（二选一）

前端需要在“未登录或会话过期”时跳转到登录页，并保证所有会返回 401 的请求都能被统一处理。有两种常见做法，对比如下。

### 方案 A：统一封装 fetch，收到 401 再跳转

**思路**：不单独发请求判断“是否已登录”。用户打开任意 URL（包括 `/`、`/settings`）都先渲染对应页面；页面内首次调用敏感 API（如加载书签、设置）时，若该请求返回 401，则在封装层统一拦截并跳转 `/login?redirect=当前页`。

**实现要点**：
- 提供统一的 `apiFetch(url, options)`（或 composable），内部用 `fetch(..., { credentials: 'include' })`，对 `response.status === 401` 做处理：跳转 `/login?redirect=${encodeURIComponent(currentPath)}`。
- 把所有会访问敏感接口的 `fetch('/api/...')` 逐步替换为该封装；或仅对“会 401 的接口”使用封装，其余保持原样（需确保没有遗漏）。
- 不新增 `GET /api/auth/me`；不依赖路由守卫判断登录态。

| 对比项 | 方案 A |
|--------|--------|
| **实现量** | 需新增 `apiFetch` 并替换现有 fetch 调用点（useDataSync、useSettingsSync、各组件内对 /api/data、/api/ai、/api/extract-meta、/api/check-url 的调用）。 |
| **首次进入体验** | 用户打开首页 → 先看到首页骨架/空白 → 数据请求 401 → 再跳登录页。会有短暂“闪一下再跳转”的可能。 |
| **直接访问 /settings 等** | 同样先进入页面，请求 401 后跳登录；登录成功后可根据 redirect 回到 /settings。 |
| **会话过期** | 正在使用时某次请求 401，立刻跳登录页，行为一致。 |
| **漏网请求** | 若有地方仍用原生 `fetch` 且未检查 401，该处不会自动跳转，可能只表现为“数据没加载”或报错，需保证所有敏感请求都走封装。 |
| **额外请求** | 无；不增加 auth 检查请求。 |

---

### 方案 B：路由守卫 + 登录态检查，未登录直接进登录页

**思路**：在进入需要登录的页面（如 `/`、`/settings`）之前，先判断“当前是否已登录”；未登录则直接重定向到 `/login`，不渲染业务页面。判断方式可以是：调用 `GET /api/auth/me`（需鉴权，返回 200 或 401），或在登录成功后把“已登录”标记写入 localStorage/sessionStorage，路由守卫只读该标记（不请求）。

**实现要点**：
- 新增 `GET /api/auth/me`：带 Cookie 请求，鉴权通过返回 `{ "ok": true }`，未通过返回 401。
- 在 `router.beforeEach` 中，若 `to.meta.requiresAuth` 为 true，先发 `GET /api/auth/me`（或读本地“已登录”标记）；若 401 或未登录，则 `next({ path: '/login', query: { redirect: to.fullPath } })`，否则 `next()`。
- 登录成功：写 localStorage 标记（若用“本地标记”方案）并跳转；登出或任何接口 401 时清除该标记。若用“每次请求 me”则不必维护标记，但每次进站/刷新都会多一次 me 请求。
- 仍建议对 fetch 做一层封装，在 401 时清除登录标记并跳转登录页，以处理“用着用着会话过期”的情况。

| 对比项 | 方案 B |
|--------|--------|
| **实现量** | 需新增 `/api/auth/me`、路由守卫、可选 localStorage 标记；若用“每次 me”则每次进入受保护页会多一次请求。 |
| **首次进入体验** | 未登录用户打开首页 → 守卫先执行 → 请求 me 得 401（或读不到标记）→ 直接跳登录页，**不会先渲染首页再跳**，无“闪一下”的问题。 |
| **直接访问 /settings 等** | 守卫拦截，先检查登录态，未登录直接进登录页。 |
| **会话过期** | 若仅靠守卫，只在“下一次导航”时才发现；若同时做了 fetch 封装 + 401 时跳转，则与方案 A 一致。通常建议 **守卫 + 封装双保险**：守卫负责“进门”时检查，封装负责“用着用着 401”时跳转。 |
| **漏网请求** | 与 A 类似，若有未走封装的请求返回 401，需在封装或全局处统一处理；若用“本地标记”，登出或 401 时须记得清除。 |
| **额外请求** | **“每次进页请求 me”**：每次进入受保护路由或刷新都会多 1 次 me 请求。**“本地标记”**：无额外请求，但刷新后若仅靠标记可能误判（例如服务端已使 session 失效但本地标记仍在），可搭配“首次 401 时清标记并跳转”缓解。 |

---

### 简要对比与建议

| 维度 | 方案 A（仅 401 时跳转） | 方案 B（守卫 + 登录态检查） |
|------|-------------------------|-----------------------------|
| **实现复杂度** | 低（只做封装 + 替换 fetch） | 中（多 me 接口 + 守卫 + 可选本地标记） |
| **未登录进站** | 可能先看到页面再跳登录（可接受则可选） | 直接进登录页，无闪屏 |
| **请求次数** | 无额外请求 | 若每次进页调 me，多 1 次/页；若用本地标记则无 |
| **会话过期** | 任一处 401 即跳转 | 需配合封装 401 处理，否则要等下次导航 |
| **适用** | 希望实现简单、少请求、可接受“先进页再跳” | 希望“未登录绝不进业务页”、体验更干净 |

**建议**：若希望**实现更快、少一次 me 请求**，选 **方案 A**；若希望**未登录时绝不渲染首页/设置页**（避免闪一下再跳），选 **方案 B**（守卫 + me，或守卫 + 本地标记 + 首次 401 清标记）。两种方式都可以再配合“封装 fetch 并在 401 时跳转”，以统一处理会话过期。

---

## 五、阶段三：前端登录与 401 处理（方案 B）

**目标**：未登录时由路由守卫拦截并直接进登录页；登录成功后进入首页或 redirect；会话过期时任一接口 401 则跳转登录页。**已采用方案 B**：路由守卫 + `GET /api/auth/me` + 封装 fetch 处理 401。

### 步骤 3.1：登录页与路由、路由守卫

**改动文件**：新建 `src/views/Login.vue`；修改 `src/router/index.ts`。

**实现方式**：

1. **登录页**：新建 `src/views/Login.vue`：
   - 含一个密码输入框、一个“登录”按钮；提交时 `POST /api/auth/login`，body `{ password }`，**需带 `credentials: 'include'`**（以便接收并保存 Set-Cookie）。
   - 成功（200 且 `ok: true`）：跳转到 `router.query.redirect` 或首页 `'/'`（`router.push(redirect || '/')`）。
   - 失败（401）：展示“密码错误”；若 429 则展示“尝试过于频繁，请稍后再试”。
2. **路由**：
   - 新增：`{ path: '/login', name: 'Login', component: () => import('@/views/Login.vue'), meta: { title: '登录' } }`（登录页不需要鉴权）。
   - 为 Home、Settings 增加 `meta: { requiresAuth: true }`，表示进入前需已登录。
3. **路由守卫（方案 B 核心）**：在 `router.beforeEach` 中：
   - 若 `to.meta.requiresAuth` 为 true：先请求 `GET /api/auth/me`（`fetch('/api/auth/me', { credentials: 'include' })`）。
     - 若响应 200：视为已登录，`next()` 放行。
     - 若响应 401：未登录或会话失效，`next({ path: '/login', query: { redirect: to.fullPath } })`，不进入目标页。
   - 若目标为 `/login` 或无需 `requiresAuth`：直接 `next()`。
   - 这样未登录用户访问 `/` 或 `/settings` 时会先被守卫拦截，直接进登录页，不会先渲染业务页再跳转。

---

### 步骤 3.2：登录成功后行为

**实现方式**：

- 在 Login.vue 中，登录成功后的跳转已包含在 3.1（`router.push(redirect || '/')`）。
- Cookie 方案下，之后所有同源 `fetch` 自动携带 Cookie；需保证请求带 `credentials: 'include'`（同源默认会带，若将来跨域需显式写）。

---

### 步骤 3.3：会话过期时的 401 处理（封装 fetch）

**改动文件**：新建 `src/utils/api.ts`（或 composable）；将各处在 `src/**` 中对敏感 API 的 `fetch` 改为使用该封装。

**实现方式**：

- **目的**：用户已进入页面后，若会话过期（如长时间未操作、KV 中 session 过期），下一次请求会返回 401；需统一处理并跳转登录页，避免只出现“数据加载失败”而无跳转。
- **实现**：提供 `apiFetch(url, options)`（或类似名），内部 `fetch(url, { ...options, credentials: 'include' })`，对 `response.status === 401`：
  - 若当前路径不是 `/login`，则 `router.push({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } })`。
  - 返回的 Promise 可 reject 或 resolve 但由调用方根据 status 处理；或封装成“401 时直接跳转且不再把响应交给业务”的语义（由你约定）。
- **替换范围**：所有会访问敏感接口的调用（如 `useDataSync`、`useSettingsSync`、各组件内对 `/api/data/*`、`/api/ai/*`、`/api/extract-meta`、`/api/check-url` 的 fetch）改为使用 `apiFetch`，确保 401 时统一跳转。
- **与守卫的关系**：守卫负责“进门时”用 `me` 判断；封装 fetch 负责“用着用着 401”时跳转，二者互补。

---

## 六、阶段四：SSRF 防护

**目标**：对 `/api/favicon`、`/api/extract-meta`、`/api/check-url` 中使用的 URL 做“禁止内网与元数据地址”校验。

### 步骤 4.1：实现 isUrlAllowed 工具函数

**改动文件**：`functions/api/[[path]].ts`（或新建 `functions/api/utils/ssrf.ts` 再在 `[[path]].ts` 中引用）

**实现方式**：

1. 实现 `isUrlAllowed(url: URL): boolean`：
   - 只允许 `http:` 和 `https:`，禁止其他 protocol。
   - 取 `url.hostname`（小写），禁止以下情况：
     - 精确匹配：`localhost`、`::1`、`0.0.0.0`、`127.0.0.1`、`169.254.169.254`（以及常见元数据域名若存在）。
     - 内网 IP 段：`10.x.x.x`、`192.168.x.x`、`172.16.x.x`～`172.31.x.x`；以及 IPv6 的 `::ffff:10.x.x.x` 等。
   - 判断方式：若 hostname 是 IP 地址，则解析后判断是否属私有/回环/链路本地；若为域名，则禁止上述精确匹配列表。可参考：`url.hostname` 用正则或 `net` 模块（Node 有，Workers 无）——在 Workers 中可用正则匹配 IPv4 的 `10\.\d+\.\d+\.\d+`、`192\.168\.\d+\.\d+`、`172\.(1[6-9]|2\d|3[01])\.\d+\.\d+`，以及 `127.0.0.1`、`0.0.0.0`、`169.254.169.254`；对 `localhost`、`::1` 直接字符串比较。
2. 若 URL 不允许，返回 `false`；允许则返回 `true`。

---

### 步骤 4.2：在三处接口中调用 isUrlAllowed

**改动文件**：`functions/api/[[path]].ts`

**实现方式**：

- 在 **GET /api/favicon**：解析出 `url` 得到 `URL` 对象后，若 `!isUrlAllowed(url)` 则 `return c.json({ ok: false, error: 'URL not allowed' }, 400)`，再继续原有 fetch 逻辑。
- 在 **POST /api/extract-meta**：解析 body 中的 `url` 得到 `URL` 后，同样 `!isUrlAllowed(url)` 则 400。
- 在 **POST /api/check-url**：同上，对 body 中的 `url` 解析并校验。

三处可复用同一段“解析 URL + 校验”的代码，减少重复。

---

## 七、步骤与文件对照表

| 阶段 | 步骤 | 主要改动文件 | 说明 |
|------|------|--------------|------|
| 一 | 1.1 | `functions/api/[[path]].ts` | Bindings、POST /auth/login、KV session、Set-Cookie |
| 一 | 1.2 | `functions/api/[[path]].ts` | requireAuth 中间件、白名单路径、保护路径 |
| 一 | 1.3 | `functions/api/[[path]].ts` | 将鉴权挂到所有需保护路由 |
| 一 | 1.4 | `functions/api/[[path]].ts` | POST /auth/logout、清 Cookie 与 KV |
| 一 | 1.5 | `functions/api/[[path]].ts` | GET /auth/me（需鉴权，方案 B 守卫用） |
| 二 | 2.1 | `functions/api/[[path]].ts` | login 前按 IP 限流（KV 计数）、429 |
| 三 | 3.1 | 新建 `src/views/Login.vue`，改 `src/router/index.ts` | 登录页、/login 路由、requiresAuth、路由守卫调 GET /api/auth/me |
| 三 | 3.2 | （同 3.1） | 登录成功跳转 redirect 或 / |
| 三 | 3.3 | 新建 `src/utils/api.ts`，替换各处在 `src/**` 中对敏感 API 的 fetch | apiFetch、401 时跳转 /login（会话过期） |
| 四 | 4.1 | `functions/api/[[path]].ts` 或 `functions/api/utils/ssrf.ts` | isUrlAllowed(url) |
| 四 | 4.2 | `functions/api/[[path]].ts` | favicon、extract-meta、check-url 三处调用 isUrlAllowed |

---

## 八、本地与部署配置

- **本地开发**：在项目根目录 `.dev.vars`（或 wrangler 推荐的本地 secret 方式）中配置 `OMNINAV_OWNER_PASSWORD=你的密码`，否则未配置时鉴权中间件应放行所有请求（见步骤 1.2），便于本地不设密也能访问。
- **部署**：在 Cloudflare 上为 Pages 项目配置 secret：`OMNINAV_OWNER_PASSWORD`（wrangler secret 或 Dashboard 环境变量且勾选 secret）。  
- **文档**：在 `DEPLOY_TO_CLOUDFLARE.md` 中增加“主人密码”小节（见《安全性改进方案》五），说明配置项与首次访问、登录流程。

---

## 九、确认后执行顺序建议

1. **阶段一**：步骤 1.1 → 1.2 → 1.3 → 1.4（登出）→ 1.5（GET /api/auth/me），完成后可用 curl/Postman 验证 login、me、logout 与 401 行为。  
2. **阶段二**：步骤 2.1，与阶段一一起或紧随其后。  
3. **阶段三（方案 B）**：步骤 3.1（登录页 + 路由守卫调 me）→ 3.2 → 3.3（apiFetch + 401 跳转），完成后在浏览器中验证：未登录进站直接进登录页、登录后正常使用、登出或会话过期后 401 并跳转。  
4. **阶段四**：步骤 4.1 → 4.2，独立验证：请求内网 URL 应返回 400。

P2（PUT 限制、私密分类密码升级、写接口限流）、P3（CORS、依赖审计）不列入本分步计划，可在上述阶段全部完成后再按《安全性改进方案》四的优先级排期。

---

以上选项已确认，可从阶段一步骤 1.1 开始逐步实现代码。
