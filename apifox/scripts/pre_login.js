/**
 * KnowledgeRAG-GZHU — Apifox 登录前置脚本
 *
 * 使用位置：
 *   Apifox → 接口「POST /api/login/login」→「后置操作」→「自定义脚本」
 *
 * 作用：
 *   1. 登录成功后自动把 access_token 写入当前环境的 {{token}} 变量
 *   2. 后续所有携带 Authorization: Bearer {{token}} 的请求无需手动填写 Token
 *
 * 配置步骤：
 *   1. 在 Apifox 的「项目设置 → Auth」中选择「Bearer Token」，值填 {{token}}
 *   2. 把此脚本粘贴到登录接口的「后置脚本」区域
 *   3. 运行登录接口，观察「控制台」输出 "✅ Token 已自动写入环境变量" 即为成功
 */

// ── 提取响应体 ───────────────────────────────────────────────
const response = pm.response.json();

if (response && response.access_token) {
    // 写入当前激活环境的 token 变量（自动切换本地/服务器环境均生效）
    pm.environment.set("token", response.access_token);
    console.log("✅ Token 已自动写入环境变量 {{token}}，有效期 24 小时");
    console.log("   Token 前缀：" + response.access_token.substring(0, 20) + "...");
} else {
    console.error("❌ 登录失败，未获取到 access_token");
    console.error("   响应内容：" + JSON.stringify(response));
}

// ── 可选：打印当前用户信息 ────────────────────────────────────
if (response && response.email) {
    console.log("   当前登录账号：" + response.email);
}
