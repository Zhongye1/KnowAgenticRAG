# KnowledgeRAG 前端 Dockerfile
# 两阶段构建：Node.js 构建 → Nginx 托管

# ─────────────────── Stage 1: Builder ───────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# 复制依赖文件（利用 Docker 层缓存）
COPY package*.json ./

# 使用 npm 淘宝镜像加速
RUN npm config set registry https://registry.npmmirror.com && \
    npm ci --prefer-offline

# 复制源码并构建
COPY . .
RUN npm run build

# ─────────────────── Stage 2: Nginx ───────────────────
FROM nginx:1.25-alpine AS runtime

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx 配置：支持 Vue Router history 模式，反代后端 /api
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
