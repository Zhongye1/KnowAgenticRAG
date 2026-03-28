/**
 * KnowledgeRAG-GZHU — Apifox 全局前置脚本（Auth 注入）
 *
 * 使用位置：
 *   Apifox → 项目设置 → 「全局前置操作」→「自定义脚本」
 *   （这样每次请求都自动携带 Token，无需逐接口配置）
 *
 * 逻辑说明：
 *   - 如果当前环境中已有 token，自动注入到 Authorization Header
 *   - 如果 token 为空，跳过注入并提示需要先运行登录接口
 *   - 登录接口本身（/api/login/login）不注入 Token（避免循环）
 */

const token = pm.environment.get("token");
const requestUrl = pm.request.url.toString();

// 登录/注册接口不需要 Token
const skipPaths = [
    "/api/login/login",
    "/api/register",
    "/api/password-reset",
    "/api/qq-login",
    "/helloworld",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/"
];

const isSkipped = skipPaths.some(path => requestUrl.includes(path));

if (!isSkipped) {
    if (token && token.trim() !== "") {
        // 自动注入 Bearer Token
        pm.request.headers.upsert({
            key: "Authorization",
            value: "Bearer " + token
        });
    } else {
        console.warn("⚠️  当前环境 {{token}} 为空，请先运行「POST /api/login/login」获取 Token");
    }
}
