#!/bin/bash
# ═══════════════════════════════════════════════════════════
# KnowledgeRAG-GZHU  停止脚本
# 使用：bash stop.sh          （停止并删除容器，保留数据）
#       bash stop.sh --clean  （同时删除所有本项目镜像）
# ═══════════════════════════════════════════════════════════

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}正在停止 KnowledgeRAG-GZHU 所有服务...${NC}"
docker compose down

if [ "$1" == "--clean" ]; then
    echo -e "${YELLOW}正在删除本项目镜像...${NC}"
    docker rmi rag-backend:latest rag-frontend:latest 2>/dev/null || true
    echo -e "${GREEN}镜像已清理${NC}"
fi

echo -e "${GREEN}✓ 所有容器已停止，数据已保留在 ./data 目录${NC}"
