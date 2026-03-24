# ── 前端 Dockerfile（最轻量方案：node:20-alpine 构建 + nginx:alpine 服务）
# 目标大小 < 50MB

# ─────────────────── Stage 1: Build ───────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# 配置 npm 淘宝镜像加速
RUN npm config set registry https://registry.npmmirror.com

# 先复制依赖文件（利用 Docker layer 缓存）
COPY package*.json ./
RUN npm ci --prefer-offline

# 复制源码并构建
COPY . .
RUN npm run build

# ─────────────────── Stage 2: Serve ───────────────────
FROM nginx:alpine AS runtime

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 nginx 配置（如果存在则覆盖，否则使用默认）
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=20s --timeout=5s --retries=3 \
    CMD wget -q --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
