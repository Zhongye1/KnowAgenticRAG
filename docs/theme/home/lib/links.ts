/** 文档站首页用到的站内路径与站外链接。 */

/**
 * 站内路径写成站点根路径，不带 base：交给 `@theme` 的 `Link` 在渲染时补 base 前缀并做
 * 客户端跳转。直接把这里的值塞进 `<a href>` 会漏掉 base，线上 404。
 *
 * 目标页按「哪一页拥有这件事」选：RAG 总览与引用落在知识库教程页，图谱运维落在知识库
 * 管理页，解析落在文档处理页，重排与厂商落在模型配置页，智能体相关落在 `agents/` 各自的
 * 页面。SPA 首页 `web/src/pages/home/lib/links.ts` 是同一套目标（那边是文档站的绝对地址）。
 */
export const outbound = {
  home: '/',
  docs: '/intro/project-overview',
  docsQuickStart: '/intro/quick-start',
  docsKnowledge: '/intro/knowledge-base',
  docsGraph: '/advanced/knowledge-base-operations',
  docsParsing: '/advanced/document-processing',
  docsMechanisms: '/mechanisms/knowledge-base',
  docsModels: '/intro/model-config',
  docsAgents: '/agents/agents-config',
  docsEvaluation: '/agents/agent-evaluation',
  docsSandbox: '/agents/sandbox-architecture',
  docsSkills: '/agents/skills-management',
  docsApi: '/advanced/api-key-integration',
  docsMcp: '/agents/mcp-integration',
  docsCli: '/intro/cli',
  repo: 'https://github.com/Zhongye1/KnowAgenticRAG',
} as const;

/** 顶栏与页脚的品牌标，与 SPA 首页 `web/src/shared/config/links.ts` 同一个地址。 */
export const BRAND_LOGO_URL =
  'https://avatars.githubusercontent.com/u/317238479?s=400&u=3872a4747631973b7806f7d77cb9ad212c39cf00&v=4';
