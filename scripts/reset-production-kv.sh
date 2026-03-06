#!/bin/bash

# OmniNav 生产环境数据重置脚本
# 此脚本将清空指定 Cloudflare KV 命名空间中的所有数据，实现「出厂重置」。

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}OmniNav 生产环境重置工具${NC}"
echo "--------------------------------"

# 检查 wrangler 是否安装
if ! command -v npx &> /dev/null; then
    echo -e "${RED}错误: 未找到 npx，请确保安装了 Node.js 和 npm。${NC}"
    exit 1
fi

# 交互式获取 Namespace ID
echo -e "你可以通过执行 ${GREEN}npx wrangler kv:namespace list${NC} 来查看你的命名空间 ID。"
read -p "请输入要重置的 KV Namespace ID: " NAMESPACE_ID

if [ -z "$NAMESPACE_ID" ]; then
    echo -e "${RED}错误: 必须提供 Namespace ID。${NC}"
    exit 1
fi

# 确认操作
echo -e "${RED}警告: 此操作将删除该 KV 命名空间内的所有数据（包括书签、分类、密码等），且不可恢复！${NC}"
read -p "确定要继续吗？(y/N): " CONFIRM

if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "操作已取消。"
    exit 0
fi

echo -e "${YELLOW}正在获取所有 Key...${NC}"

# 获取所有 keys
# 注意：若 key 数量非常多（超过 1000），列表可能会分页。
KEYS=$(npx wrangler kv:key list --namespace-id "$NAMESPACE_ID" | grep -o '"name": "[^"]*' | cut -d'"' -f4)

if [ -z "$KEYS" ]; then
    echo -e "${GREEN}命名空间已为空，无需清理。${NC}"
    exit 0
fi

COUNT=$(echo "$KEYS" | wc -l)
echo -e "${YELLOW}发现 $COUNT 个 Key，准备删除...${NC}"

# 批量删除
for KEY in $KEYS; do
    echo -n "正在删除: $KEY ... "
    npx wrangler kv:key delete --namespace-id "$NAMESPACE_ID" "$KEY" --preview false &> /dev/null
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}成功${NC}"
    else
        echo -e "${RED}失败${NC}"
    fi
done

echo "--------------------------------"
echo -e "${GREEN}重置完成！${NC}"
echo "现在访问你的生产环境地址，将看到「首次使用」设置页面。"
