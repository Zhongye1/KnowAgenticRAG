/**
 * 首页展示用的端点路径与字符串。
 *
 * 放在 `api/` 段是因为工程信任检查把「`/api` 路径」限制在 api 段内（页面组件里写这个
 * 字面量会被拦下）。路径与 `backend/server/routers/agent_router.py` 的
 * `POST /agent/runs`（挂载前缀 `/api`）一致；接入面板的 API 页复用这两个常量，
 * 避免同一个端点串在页面上出现两份。
 */
export const AGENT_RUNTIME_PATH = '/api/agent/runs';

export const AGENT_RUNTIME_ENDPOINT = `POST ${AGENT_RUNTIME_PATH}`;
