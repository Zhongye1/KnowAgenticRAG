/**
 * NexusConsole 的接入方式数据。
 *
 * 事实串用本仓的真实事实：API 是 `POST /api/agent/runs`（复用
 * `AGENT_RUNTIME_ENDPOINT`，见 `backend/server/routers/agent_router.py`）配
 * `Authorization: Bearer arskey_…`（见 `backend/server/utils/auth_middleware.py` 与
 * `docs/advanced/api-key-integration.md`）；CLI 是 `ars-cli`，一个用 httpx 调远端实例的
 * HTTP 客户端，没有 stdio 传输（见 `docs/intro/cli.md` 与 `packages/ars-cli/src`）。
 *
 * MCP 那一页照搬参照实现：本仓只有 MCP 客户端（`/api/system/mcp-servers` 管的是本仓去连
 * 别人的 MCP 服务），没有对外 MCP 网关，所以它的端点、API Key 名与示例代码都是参照实现
 * 的东西，属待定稿，对外发布前必须替换（见 tracked 决策记录
 * `docs/develop-guides/decisions/implemented/2026-10-11-web-antd-yuxi-alignment.md`）。
 *
 * 散文与终端装饰（标题、描述、流标签）照搬参照实现。
 *
 * 放 `api/` 段是因为内容里含 `/api` 字面量，工程信任检查只允许 api 段出现它。
 */
import { outbound } from '../lib/links';
import { AGENT_RUNTIME_ENDPOINT, AGENT_RUNTIME_PATH } from './runtime-endpoint';

export type AccessTab = {
  id: 'MCP' | 'API' | 'CLI';
  eyebrow: string;
  title: string;
  description: string;
  specs: { label: string; value: string }[];
  features: string[];
  stream: string;
  endpoint: string;
  code: string;
  transport: string;
  docsHref: string;
};

export const ACCESS_TABS: readonly AccessTab[] = [
  {
    id: 'MCP',
    eyebrow: 'REMOTE ACCESS · MCP',
    title: 'MCP Server Gateway',
    description:
      'Connect MCP-compatible clients through one authenticated remote endpoint.',
    specs: [
      {
        label: 'CLIENT ENVS',
        value: 'Cursor · Claude Desktop · Windsurf · Autonomous Agents',
      },
      { label: 'METHOD', value: 'POST /mcp' },
      { label: 'AUTH TYPE', value: 'Bearer API Key' },
    ],
    features: [
      'Remote endpoint over HTTPS',
      'Bearer-token authentication',
      'Client-ready tool calls',
    ],
    stream: 'ausvector-stream // mcp',
    endpoint: 'https://mcp.ausvector.ai/mcp',
    code: `// MCP Client Configuration (claude_desktop_config.json)
{
  "mcpServers": {
    "ausvector": {
      "url": "https://mcp.ausvector.ai/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_MATRIX_KEY"
      }
    }
  }
}`,
    transport: 'TRANSPORT: HTTP POST / TLS 1.3',
    docsHref: outbound.docsMcp,
  },
  {
    id: 'API',
    eyebrow: 'REMOTE ACCESS · HTTP API',
    title: 'Structured HTTP API',
    description:
      'Integrate through JSON endpoints with explicit HTTP methods and API-key authentication.',
    specs: [
      {
        label: 'CLIENT ENVS',
        value: 'Backend Microservices · Python SDK · Cloud Workers',
      },
      { label: 'METHOD', value: AGENT_RUNTIME_ENDPOINT },
      { label: 'AUTH TYPE', value: 'Authorization: Bearer arskey_…' },
    ],
    features: [
      'JSON requests and responses',
      'API-key authentication',
      'Run events over SSE',
    ],
    stream: 'ausvector-stream // api',
    endpoint: AGENT_RUNTIME_ENDPOINT,
    code: `# Create a run with an API key
curl -X POST "https://<your-instance>${AGENT_RUNTIME_PATH}" \\
  -H "Authorization: Bearer arskey_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "Summarise this knowledge base",
    "agent_slug": "default-chatbot",
    "thread_id": "thread_xxx"
  }'`,
    transport: 'TRANSPORT: HTTPS / TLS 1.3',
    docsHref: outbound.docsApi,
  },
  {
    id: 'CLI',
    eyebrow: 'REMOTE ACCESS · CLI',
    title: 'Command-Line Interface',
    description:
      'Use the CLI from local shells and CI jobs without placing credentials in each command.',
    specs: [
      {
        label: 'CLIENT ENVS',
        value: 'Terminal · Local Bash/Zsh · CI/CD Pipelines',
      },
      { label: 'METHOD', value: 'ars <command>' },
      { label: 'AUTH TYPE', value: 'ars login --api-key' },
    ],
    features: [
      'Installed with uv tool install',
      'Browser or API-key login',
      'Terminal-ready output',
    ],
    stream: 'ausvector-stream // cli',
    endpoint: 'uv tool install ars-cli',
    code: `# Install the CLI and connect it to an instance
uv tool install ars-cli
ars remote add local http://localhost:5173
ars remote use local
ars login --api-key arskey_xxx`,
    transport: 'TRANSPORT: HTTP(S) → REMOTE INSTANCE',
    docsHref: outbound.docsCli,
  },
];
