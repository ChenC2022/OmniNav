#!/usr/bin/env bash
# bump-version.sh — OmniNav 版本升级脚本
#
# 版本策略（见 docs/VERSIONING.md）：
#   MAJOR.MINOR 两端强制同步；PATCH 各端独立。
#
# 用法：
#   ./scripts/bump-version.sh minor          # 两端 MINOR +1，PATCH 归零
#   ./scripts/bump-version.sh major          # 两端 MAJOR +1，MINOR/PATCH 归零
#   ./scripts/bump-version.sh web-patch      # 仅网页版 PATCH +1
#   ./scripts/bump-version.sh ext-patch      # 仅插件 PATCH +1
#   ./scripts/bump-version.sh <web> <ext>    # 手动指定（需保证 MAJOR.MINOR 一致）

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEB_PKG="$ROOT_DIR/package.json"
EXT_PKG="$ROOT_DIR/extensions/omninav-extension/package.json"

# ── 读取当前版本 ──────────────────────────────────────────────
web_cur=$(node -p "require('$WEB_PKG').version")
ext_cur=$(node -p "require('$EXT_PKG').version")

IFS='.' read -r web_major web_minor web_patch <<< "$web_cur"
IFS='.' read -r ext_major ext_minor ext_patch <<< "$ext_cur"

# ── 计算新版本 ────────────────────────────────────────────────
case "${1:-}" in
  major)
    web_new="$((web_major+1)).0.0"
    ext_new="$((ext_major+1)).0.0"
    ;;
  minor)
    web_new="${web_major}.$((web_minor+1)).0"
    ext_new="${ext_major}.$((ext_minor+1)).0"
    ;;
  web-patch)
    web_new="${web_major}.${web_minor}.$((web_patch+1))"
    ext_new="${ext_cur}"
    ;;
  ext-patch)
    web_new="${web_cur}"
    ext_new="${ext_major}.${ext_minor}.$((ext_patch+1))"
    ;;
  "")
    echo "用法: $0 <major|minor|web-patch|ext-patch>  或  $0 <web版本> <ext版本>"
    exit 1
    ;;
  *)
    # 手动指定两个版本号
    if [[ $# -ne 2 ]]; then
      echo "手动模式需要同时提供网页版和插件版版本号"
      echo "用法: $0 <web版本> <ext版本>"
      exit 1
    fi
    web_new="$1"
    ext_new="$2"
    # 校验 MAJOR.MINOR 必须一致
    IFS='.' read -r wM wm _ <<< "$web_new"
    IFS='.' read -r eM em _ <<< "$ext_new"
    if [[ "$wM.$wm" != "$eM.$em" ]]; then
      echo "✗ 错误：手动指定版本时，网页版和插件的 MAJOR.MINOR 必须相同"
      echo "  网页版: $web_new  →  MAJOR.MINOR = $wM.$wm"
      echo "  插件:   $ext_new  →  MAJOR.MINOR = $eM.$em"
      echo "  请参阅 docs/VERSIONING.md"
      exit 1
    fi
    ;;
esac

# ── 打印变更预览 ──────────────────────────────────────────────
echo ""
echo "  网页版：$web_cur  →  $web_new"
echo "  插件版：$ext_cur  →  $ext_new"
echo ""

# MAJOR.MINOR 一致性校验（针对 web-patch / ext-patch 以外的模式）
IFS='.' read -r wM wm _ <<< "$web_new"
IFS='.' read -r eM em _ <<< "$ext_new"
if [[ "${1:-}" != "web-patch" && "${1:-}" != "ext-patch" ]]; then
  if [[ "$wM.$wm" != "$eM.$em" ]]; then
    echo "✗ 内部错误：计算出的版本 MAJOR.MINOR 不一致，请检查脚本逻辑"
    exit 1
  fi
fi

read -rp "确认升级？[y/N] " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "已取消"; exit 0; }

# ── 写入 package.json ─────────────────────────────────────────
node -e "
  const fs = require('fs');
  const p = JSON.parse(fs.readFileSync('$WEB_PKG','utf8'));
  p.version = '$web_new';
  fs.writeFileSync('$WEB_PKG', JSON.stringify(p, null, 2) + '\n');
"
node -e "
  const fs = require('fs');
  const p = JSON.parse(fs.readFileSync('$EXT_PKG','utf8'));
  p.version = '$ext_new';
  fs.writeFileSync('$EXT_PKG', JSON.stringify(p, null, 2) + '\n');
"

echo ""
echo "✓ 版本号已更新"
echo ""
echo "接下来请执行完整发布流程（参阅 docs/VERSIONING.md）："
echo ""
echo "  # 构建两端（插件构建时 manifest.json 自动同步）"
echo "  npm run build"
echo "  cd extensions/omninav-extension && npm run build && cd ../.."
echo ""
echo "  # 提交 + 打 tag"
echo "  git add -A"
echo "  git commit -m \"chore: release web v${web_new} / ext v${ext_new}\""
echo "  git tag web-v${web_new}"
echo "  git tag ext-v${ext_new}"
echo "  git push origin main --tags"
