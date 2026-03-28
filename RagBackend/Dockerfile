# ── 后端 Dockerfile（最轻量方案：python:3.11-slim）
# 目标镜像大小 < 600MB（不含 Ollama 模型权重，仅应用层）
#
# 使用分阶段构建：
#   Stage 1: builder — 安装依赖（带 build tools）
#   Stage 2: runtime — 只复制必要文件（无 build tools）

# ─────────────────── Stage 1: Builder ───────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

# 安装编译依赖（构建阶段用完即丢弃）
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# 使用清华镜像加速 pip
RUN pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple

# 复制依赖文件并安装到 /install 目录（供 runtime 复制）
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install \
    # 排除不必要的重型依赖（如 layoutparser、google-api-python-client 在基础部署中可选）
    --requirement requirements.txt


# ─────────────────── Stage 2: Runtime ───────────────────
FROM python:3.11-slim AS runtime

WORKDIR /app

# 只安装运行时系统依赖（tesseract 用于 OCR，可选）
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    # tesseract-ocr \   # 取消注释以启用 OCR（会增加 ~80MB）
    && rm -rf /var/lib/apt/lists/*

# 从 builder 阶段复制已安装的 Python 包
COPY --from=builder /install /usr/local

# 复制应用代码（排除开发文件）
COPY . .

# 创建必要目录
RUN mkdir -p local-KLB-files metadata user_avatars knowledge_base/uploaded_pics/covers

# 环境变量默认值（生产环境通过 docker-compose 或 -e 覆盖）
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app \
    PORT=8000

EXPOSE 8000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/')" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
