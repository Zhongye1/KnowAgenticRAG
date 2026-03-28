#!/bin/bash
# ═══════════════════════════════════════════════════════════
# KnowledgeRAG-GZHU  启动脚本
# 功能：启动前自动检测端口占用，清理旧容器，防止端口堵塞
# 使用：bash start.sh          （正常启动）
#       bash start.sh --reset  （强制清理所有数据后重新启动）
# ═══════════════════════════════════════════════════════════

set -e

# ── 颜色定义 ────────────────────────────────────────────────
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ── 项目使用的端口 ────────────────────────────────────────
PORTS=(8000 8089 3306 11434)
PORT_NAMES=("后端API(8000)" "前端页面(8089)" "MySQL(3306)" "Ollama模型(11434)")

# ── 项目容器名称 ─────────────────────────────────────────
CONTAINERS=("asf-backend" "asf-frontend" "asf-mysql" "asf-ollama")

echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}   KnowledgeRAG-GZHU  启动检查${NC}"
echo -e "${CYAN}═══════════════════════════════════════════${NC}"

# ── Step 1: 清理本项目的旧容器 ───────────────────────────
echo -e "\n${YELLOW}[1/4] 检查并清理旧容器...${NC}"
for container in "${CONTAINERS[@]}"; do
    if docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
        STATUS=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "unknown")
        echo -e "  发现旧容器 ${container}（状态: ${STATUS}），正在停止并删除..."
        docker stop "$container" 2>/dev/null || true
        docker rm "$container" 2>/dev/null || true
        echo -e "  ${GREEN}✓ 已清理 ${container}${NC}"
    fi
done

# ── Step 2: 检测端口占用（非本项目进程） ─────────────────
echo -e "\n${YELLOW}[2/4] 检测端口占用情况...${NC}"
BLOCKED=0
for i in "${!PORTS[@]}"; do
    PORT=${PORTS[$i]}
    NAME=${PORT_NAMES[$i]}
    
    # 检查端口是否被占用（兼容 Linux/macOS）
    if command -v lsof &>/dev/null; then
        PID=$(lsof -ti tcp:"$PORT" 2>/dev/null || true)
    elif command -v ss &>/dev/null; then
        PID=$(ss -tlnp "sport = :$PORT" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1 || true)
    else
        PID=""
    fi
    
    if [ -n "$PID" ]; then
        PROC=$(ps -p "$PID" -o comm= 2>/dev/null || echo "未知进程")
        echo -e "  ${RED}✗ 端口 ${PORT}（${NAME}）被进程占用：${PROC}（PID: ${PID}）${NC}"
        echo -e "    解决方法："
        echo -e "    - 手动停止：kill -9 ${PID}"
        echo -e "    - 或修改 docker-compose.yml 中的端口映射"
        BLOCKED=$((BLOCKED + 1))
    else
        echo -e "  ${GREEN}✓ 端口 ${PORT}（${NAME}）空闲${NC}"
    fi
done

if [ "$BLOCKED" -gt 0 ]; then
    echo -e "\n${RED}发现 ${BLOCKED} 个端口被占用，请先解决后重新运行此脚本。${NC}"
    echo -e "${YELLOW}提示：若是上次 Docker 残留，脚本已自动清理；若仍报错，可能是本机其他服务占用端口。${NC}"
    exit 1
fi

# ── Step 3: 创建必要目录 ──────────────────────────────────
echo -e "\n${YELLOW}[3/4] 创建数据目录...${NC}"
mkdir -p data/local-KLB-files data/metadata data/user_avatars data/covers data/mysql data/ollama mysql/init
echo -e "  ${GREEN}✓ 数据目录就绪${NC}"

# ── Step 4: 启动服务 ──────────────────────────────────────
echo -e "\n${YELLOW}[4/4] 启动所有服务...${NC}"

if [ "$1" == "--reset" ]; then
    echo -e "  ${RED}⚠ --reset 模式：重新构建镜像（不删除数据卷）${NC}"
    docker compose up -d --build --force-recreate
else
    docker compose up -d
fi

echo -e "\n${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}   所有服务已启动！${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "  前端页面  : ${CYAN}http://localhost:8089${NC}"
echo -e "  后端 API  : ${CYAN}http://localhost:8000${NC}"
echo -e "  API 文档  : ${CYAN}http://localhost:8000/docs${NC}"
echo -e ""
echo -e "  查看日志  : docker compose logs -f"
echo -e "  停止服务  : bash stop.sh  （或 docker compose down）"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
