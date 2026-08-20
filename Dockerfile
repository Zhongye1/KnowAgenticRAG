# Select the image to build based on SERVER_TYPE, defaulting to ragf_server, or docker-compose build args
ARG SERVER_TYPE=ragf_server

# === Python environment from uv ===
FROM ghcr.io/astral-sh/uv:python3.12-trixie-slim AS builder

# Used for build Python packages
RUN sed -i 's/deb.debian.org/mirrors.ustc.edu.cn/g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends gcc make python3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY . /ragf

WORKDIR /ragf

# Configure uv environment
ENV UV_COMPILE_BYTECODE=1 \
    UV_NO_CACHE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/usr/local

# Install dependencies with cache
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=backend/uv.lock,target=uv.lock \
    --mount=type=bind,source=backend/pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project

# Preinstall plugin dependencies（backend.plugin.requirements 未就绪时跳过）
RUN --mount=type=cache,target=/root/.cache/uv \
    bash -c 'python -c "import backend.plugin.requirements" 2>/dev/null \
      && python -c "from backend.plugin.requirements import install_requirements; install_requirements(None)" \
      || echo "[Dockerfile] backend.plugin.requirements not found, skip plugin preinstall"'

# === Runtime base server image ===
FROM ghcr.io/astral-sh/uv:python3.12-trixie-slim AS base_server

RUN sed -i 's/deb.debian.org/mirrors.ustc.edu.cn/g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates supervisor \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /ragf /ragf

COPY --from=builder /usr/local /usr/local

ENV PYTHONPATH=/ragf

COPY deploy/backend/supervisor/supervisord.conf /etc/supervisor/supervisord.conf

# === FastAPI server image ===
FROM base_server AS ragf_server

COPY deploy/backend/supervisor/ragf_server.conf /etc/supervisor/conf.d/

RUN mkdir -p /var/log/ragf

EXPOSE 8001

CMD ["supervisord", "-c", "/etc/supervisor/supervisord.conf"]

# === Celery Worker image ===
FROM base_server AS ragf_celery_worker

COPY deploy/backend/supervisor/ragf_celery_worker.conf /etc/supervisor/conf.d/

RUN mkdir -p /var/log/ragf

CMD ["supervisord", "-c", "/etc/supervisor/supervisord.conf"]

# === Celery Beat image ===
FROM base_server AS ragf_celery_beat

COPY deploy/backend/supervisor/ragf_celery_beat.conf /etc/supervisor/conf.d/

RUN mkdir -p /var/log/ragf

CMD ["supervisord", "-c", "/etc/supervisor/supervisord.conf"]

# === Celery Flower image ===
FROM base_server AS ragf_celery_flower

COPY deploy/backend/supervisor/ragf_celery_flower.conf /etc/supervisor/conf.d/

RUN mkdir -p /var/log/ragf

EXPOSE 8555

CMD ["supervisord", "-c", "/etc/supervisor/supervisord.conf"]

# Build image
FROM ${SERVER_TYPE}
