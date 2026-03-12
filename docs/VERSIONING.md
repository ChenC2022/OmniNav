# OmniNav 版本控制规范

> 本文档是强制性约定。每次发布版本前必须阅读并遵守。

---

## 版本号格式

```
MAJOR.MINOR.PATCH
```

OmniNav 由两个端组成：**网页版**（Web）和**浏览器插件**（Extension）。两者共享同一套版本规则：

| 段 | 含义 | 同步策略 |
|----|------|----------|
| `MAJOR` | 重大架构变更或破坏性改动 | **两端必须同步升级** |
| `MINOR` | 新功能里程碑（含跨端接口变更） | **两端必须同步升级** |
| `PATCH` | 单端独立修复或小改动 | 各端独立，另一端保持不变 |

---

## 核心约定

### 1. MAJOR.MINOR 必须保持一致

在任何时刻，网页版和插件的 `MAJOR.MINOR` 必须相同。  
相同的 `MAJOR.MINOR` 代表：**两端接口兼容，可以配套使用**。

```
✓ 合法：网页版 1.2.3  +  插件 1.2.1
✓ 合法：网页版 1.2.3  +  插件 1.2.3
✗ 非法：网页版 1.3.0  +  插件 1.2.5   ← MINOR 不一致
```

### 2. 何时升级 MINOR（新功能发布）

以下情况需要两端同步升级 `MINOR`，`PATCH` 归零：

- 新增功能，且该功能**涉及网页后端 API 接口变更**
- 新增功能，且该功能**需要两端配合才能完整工作**
- 任何影响插件与网页兼容性的改动

升级时两端同时从 `X.Y.*` 变为 `X.(Y+1).0`。

### 3. 何时升级 PATCH（单端修复）

以下情况只升级对应端的 `PATCH`，另一端不变：

- 纯前端 UI 修复（样式、交互、文案）
- 单端性能优化
- 单端独立的小功能增强，不涉及跨端接口

### 4. MAJOR 升级

保留用于：整体架构重构、数据格式破坏性变更、放弃向前兼容。  
MAJOR 升级时两端同步，`MINOR` 和 `PATCH` 均归零。

---

## 版本历史

| 版本 | 发布日期 | 说明 |
|------|----------|------|
| `1.1.0` | 2026-03-12 | 采用方案三统一版本策略，两端对齐起点；插件 favicon 改用后端代理；版本控制半自动化 |
| `1.0.2` | — | 插件初始版本（旧版本线，已废弃） |
| `0.2.6` | — | 网页版初始版本（旧版本线，已废弃） |

---

## 操作命令

所有版本操作在**项目根目录**执行。

### 升级 PATCH（单端修复）

```bash
# 仅升级网页版 PATCH
npm run version:web-patch

# 仅升级插件 PATCH
npm run version:ext-patch
```

### 升级 MINOR（新功能，两端同步）

```bash
npm run version:minor
# 效果：网页版和插件的 MINOR 同时 +1，PATCH 归零
```

### 升级 MAJOR（重大变更，两端同步）

```bash
npm run version:major
```

### 手动指定版本号

```bash
./scripts/bump-version.sh 1.2.0 1.2.0
```

---

## 完整发布流程

```bash
# 1. 升级版本号（根据变更类型选择命令）
npm run version:minor        # 或 version:web-patch / version:ext-patch

# 2. 构建两端
npm run build                                        # 网页版
cd extensions/omninav-extension && npm run build     # 插件（manifest.json 自动同步）
cd ../..

# 3. 提交并打 tag
git add -A
git commit -m "chore: release web v1.2.0 / ext v1.2.0"
git tag web-v1.2.0
git tag ext-v1.2.0
git push origin main --tags
```

---

## 文件职责速查

| 文件 | 职责 | 是否手动维护 |
|------|------|-------------|
| `package.json`（根目录） | 网页版版本**唯一来源** | 通过脚本修改，勿手动 |
| `extensions/omninav-extension/package.json` | 插件版本**唯一来源** | 通过脚本修改，勿手动 |
| `extensions/omninav-extension/public/manifest.json` | 插件运行时版本 | **禁止手动修改**，由构建时自动同步 |
| `scripts/bump-version.sh` | 版本升级脚本 | — |
| `docs/VERSIONING.md` | 本文档 | 规则变更时更新 |

---

## 常见问题

**Q：我只改了插件的 CSS，需要两端一起升版本吗？**  
A：不需要。只升级插件 `PATCH`（`npm run version:ext-patch`），网页版版本不变。

**Q：我新增了一个后端 API，插件也要用，怎么升版本？**  
A：这是典型的跨端功能，必须两端同步升 `MINOR`（`npm run version:minor`）。

**Q：manifest.json 的版本和插件 package.json 不一致怎么办？**  
A：运行 `cd extensions/omninav-extension && npm run build`，构建时会自动同步。永远不要手动修改 manifest.json 的版本字段。
