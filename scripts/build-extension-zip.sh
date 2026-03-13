#!/usr/bin/env bash
# 构建浏览器插件并将 dist 打包为 zip，输出到 public/omninav-extension.zip，
# 供网页版设置页「下载插件包」使用。部署前需执行此脚本以保证 zip 随前端一起发布。
# 依赖：系统需已安装 zip（如 Ubuntu/Debian: apt install zip）
set -e
if ! command -v zip &>/dev/null; then
  echo "错误: 未找到 zip 命令。请先安装 zip（如 Ubuntu/Debian: sudo apt install zip）"
  exit 1
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/public"
cd "$ROOT/extensions/omninav-extension"
npm run build
cd dist
# 清理 dist 中可能残留的旧 zip，避免被打包进去
rm -f omninav-extension.zip
# 删除旧产物，确保全量重新打包（zip 的 update 模式会保留已删除的旧文件）
rm -f "$ROOT/public/omninav-extension.zip"
zip -r "$ROOT/public/omninav-extension.zip" .
echo "→ public/omninav-extension.zip"
