@echo off
chcp 65001 >nul
:: ═══════════════════════════════════════════════════════════
:: KnowledgeRAG-GZHU  Windows 启动脚本
:: 功能：启动前自动检测端口占用，清理旧容器，防止端口堵塞
:: 使用：双击运行 start.bat，或在命令行执行
::       start.bat         （正常启动）
::       start.bat --reset （强制重新构建镜像后启动）
:: ═══════════════════════════════════════════════════════════

echo.
echo ===============================================
echo    KnowledgeRAG-GZHU  启动检查
echo ===============================================

:: ── Step 1: 清理本项目的旧容器 ───────────────────────────
echo.
echo [1/4] 检查并清理旧容器...
for %%c in (asf-backend asf-frontend asf-mysql asf-ollama) do (
    docker ps -a --format "{{.Names}}" | findstr /x "%%c" >nul 2>&1
    if not errorlevel 1 (
        echo   发现旧容器 %%c，正在停止并删除...
        docker stop %%c >nul 2>&1
        docker rm   %%c >nul 2>&1
        echo   [OK] 已清理 %%c
    )
)

:: ── Step 2: 检测端口占用 ──────────────────────────────────
echo.
echo [2/4] 检测端口占用情况...
set BLOCKED=0

call :check_port 8000 "后端API"
call :check_port 8089 "前端页面"
call :check_port 3306 "MySQL"
call :check_port 11434 "Ollama模型"

if %BLOCKED% gtr 0 (
    echo.
    echo [错误] 发现 %BLOCKED% 个端口被占用，请按提示解决后重新运行。
    echo 提示：若是 Docker 残留容器，脚本已尝试清理；若仍报错，是本机其他程序占用端口。
    pause
    exit /b 1
)

:: ── Step 3: 创建必要目录 ──────────────────────────────────
echo.
echo [3/4] 创建数据目录...
if not exist "data\local-KLB-files" mkdir "data\local-KLB-files"
if not exist "data\metadata"        mkdir "data\metadata"
if not exist "data\user_avatars"    mkdir "data\user_avatars"
if not exist "data\covers"          mkdir "data\covers"
if not exist "data\mysql"           mkdir "data\mysql"
if not exist "data\ollama"          mkdir "data\ollama"
if not exist "mysql\init"           mkdir "mysql\init"
echo   [OK] 数据目录就绪

:: ── Step 4: 启动服务 ──────────────────────────────────────
echo.
echo [4/4] 启动所有服务...

if "%~1"=="--reset" (
    echo   [--reset 模式] 重新构建镜像...
    docker compose up -d --build --force-recreate
) else (
    docker compose up -d
)

echo.
echo ===============================================
echo    所有服务已启动！
echo ===============================================
echo   前端页面  : http://localhost:8089
echo   后端 API  : http://localhost:8000
echo   API 文档  : http://localhost:8000/docs
echo.
echo   查看日志  : docker compose logs -f
echo   停止服务  : 运行 stop.bat
echo ===============================================
pause
exit /b 0

:: ── 端口检测子函数 ────────────────────────────────────────
:check_port
set PORT=%~1
set NAME=%~2
netstat -ano | findstr ":%PORT% " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
    for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
        set PID=%%p
        goto :found_%PORT%
    )
    :found_%PORT%
    echo   [X] 端口 %PORT%（%NAME%）被占用，PID: %PID%
    echo       解决方法：在任务管理器中结束 PID %PID% 对应的进程
    echo       或执行：taskkill /F /PID %PID%
    set /a BLOCKED+=1
) else (
    echo   [OK] 端口 %PORT%（%NAME%）空闲
)
exit /b 0
