# 更新日志

## [0.2.1] - 2026-03-05

### 修复

- **AI 助手 500 错误**：补充缺失的 `getJson` 辅助函数，修复从 KV 读取 settings 时的 ReferenceError
- **favicon 502**：获取失败时返回透明占位图而非 502，减少控制台报错

### 变更

- 移除 `wrangler.toml`，所有配置（含 KV 绑定）在 Cloudflare Dashboard 中完成，便于新用户使用 Bindings 的 Add 按钮
- 部署脚本添加 `--project-name=omninav` 参数
- 本地开发默认与生产一致，采用「首次使用，请设置密码」；新增 `.dev.vars.example`
- `.cursor` 目录加入 `.gitignore`，不再同步到 GitHub

---

## [0.2.0]

- 书签管理、AI 助手、云端同步等核心功能
- 首次访问者设密 / 部署密码双模式
- Cloudflare Pages + KV 部署支持
