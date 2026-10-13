/**
 * 首页用到的站外与站内链接。
 *
 * 参照实现的 `links.ts` 把未克隆的路由指回 ausvector.ai；本仓换成自己的文档站、
 * 仓库与协议页，页面里不再出现参照实现的域名。文档站与仓库地址由
 * `shared/config/links.ts` 拥有，这里只做首页的路径组合。
 */
import { DOCS_URL, REPO_URL } from '@/shared/config';

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
