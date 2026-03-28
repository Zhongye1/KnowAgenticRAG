@echo off
chcp 65001 >nul
:: ═══════════════════════════════════════════════════════════
:: KnowledgeRAG-GZHU  Windows 停止脚本
:: 使用：stop.bat         （停止并删除容器，保留数据）
::       stop.bat --clean （同时删除本项目镜像）
:: ═══════════════════════════════════════════════════════════

echo 正在停止 KnowledgeRAG-GZHU 所有服务...
docker compose down

if "%~1"=="--clean" (
    echo 正在删除本项目镜像...
    docker rmi rag-backend:latest rag-frontend:latest 2>nul
    echo 镜像已清理
)

echo [OK] 所有容器已停止，数据已保留在 .\data 目录
pause
