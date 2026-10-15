/** 首页用到的站外与站内链接。 */
import { DOCS_URL, REPO_URL } from '@/shared/config';

/** 文档站页面地址：站点按 base 部署在子路径，这里只做拼接。 */
const docsPage = (path: string) => `${DOCS_URL}${path}`;

/**
 * 目标页与文档站首页 `docs/theme/home/lib/links.ts` 一一对应：同一套「哪一页拥有这件
 * 事」的落点，改这里要同步改那边。
 */
export const outbound = {
  docs: docsPage('intro/project-overview'),
  docsQuickStart: docsPage('intro/quick-start'),
  docsKnowledge: docsPage('intro/knowledge-base'),
  docsGraph: docsPage('advanced/knowledge-base-operations'),
  docsParsing: docsPage('advanced/document-processing'),
  docsMechanisms: docsPage('mechanisms/knowledge-base'),
  docsModels: docsPage('intro/model-config'),
  docsAgents: docsPage('agents/agents-config'),
  docsEvaluation: docsPage('agents/agent-evaluation'),
  docsSandbox: docsPage('agents/sandbox-architecture'),
  docsSkills: docsPage('agents/skills-management'),
  docsApi: docsPage('advanced/api-key-integration'),
  docsMcp: docsPage('agents/mcp-integration'),
  docsCli: docsPage('intro/cli'),
  repo: REPO_URL,
} as const;
