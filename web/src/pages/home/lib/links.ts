/**
 * 首页用到的站外与站内链接。
 *
 * 参照实现的 `links.ts` 把未克隆的路由指回 ausvector.ai；本仓换成自己的文档站、
 * 仓库与协议页，页面里不再出现参照实现的域名。
 */

/** 文档站由 `.github/workflows/deploy.yml` 发布到 Pages，VitePress base 是 `/KnowledgeRAG-OGAS/`。 */
const DOCS_URL = 'https://zhongye1.github.io/KnowledgeRAG-OGAS/';

/** 页脚与顶栏指向的仓库地址。 */
const REPO_URL = 'https://github.com/Zhongye1/KnowledgeRAG-OGAS';

export const outbound = {
  docs: DOCS_URL,
  docsQuickStart: `${DOCS_URL}intro/quick-start`,
  docsKnowledge: `${DOCS_URL}intro/knowledge-base`,
  docsOperations: `${DOCS_URL}advanced/knowledge-base-operations`,
  docsMechanisms: `${DOCS_URL}mechanisms/knowledge-base`,
  docsApi: `${DOCS_URL}advanced/api-key-integration`,
  docsMcp: `${DOCS_URL}agents/mcp-integration`,
  docsCli: `${DOCS_URL}intro/cli`,
  repo: REPO_URL,
  privacyPolicy: '/protocols/privacy-policy.template.html',
} as const;
