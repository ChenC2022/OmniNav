# OmniNav 浏览器插件（Phase 2）

本目录是 OmniNav 第二阶段的浏览器插件工程（Manifest V3）。

## 开发

在仓库根目录已安装依赖的情况下，可直接在本目录运行：

```bash
npm install
npm run build
```

构建产物输出到 `extensions/omninav-extension/dist`。

## 本地加载（Chrome/Edge）

- 打开 `chrome://extensions`
- 开启「开发者模式」
- 「加载已解压的扩展程序」选择 `extensions/omninav-extension/dist`

## M0 验证步骤

1. 打开插件「设置」
2. 填写你的 OmniNav `baseUrl`（例如 `https://xxx.pages.dev` 或本地 `http://localhost:5173` 配合 `npm run dev:all`）
3. 点击「授权站点权限」（只授权你填写的 `baseUrl` 对应域名）
4. 输入 OmniNav 密码点击登录
5. 点击「立即同步」，看到“同步成功”与同步时间

