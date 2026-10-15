import { defineConfig } from '@rspress/core';
import { pluginSitemap } from '@rspress/plugin-sitemap';
import { fileURLToPath } from 'node:url';

// Pages 的项目站点路径跟随仓库名：仓库改名为 KnowAgenticRAG 后站点就发布在
// `/KnowAgenticRAG/`，`base` 与站点地址必须一起改，否则产物里所有资源与站内链接都指向旧路径。
const SITE_ORIGIN = 'https://zhongye1.github.io/KnowAgenticRAG/';
const REPO_BLOB = 'https://github.com/xerrors/ARS';

// 站点内容根就是本目录，theme/ 与配置不参与路由（详见 route.exclude）。
const MERMAID_COMPONENT = fileURLToPath(
  new URL('./theme/components/Mermaid.tsx', import.meta.url),
);

const BADGE_COMPONENT = fileURLToPath(
  new URL('./theme/components/Badge.tsx', import.meta.url),
);

type MdastNode = {
  type: string;
  lang?: string | null;
  value?: string;
  name?: string;
  attributes?: unknown[];
  children?: MdastNode[];
};

/**
 * 把 ```mermaid 代码块换成 <Mermaid chart="..." />，图表在客户端渲染。
 * RSPress 没有官方 mermaid 插件，这里自带一个最小的 remark 变换。
 */
function remarkMermaid() {
  const walk = (node: MdastNode) => {
    if (!node.children) return;
    node.children = node.children.map((child) => {
      if (child.type === 'code' && child.lang === 'mermaid') {
        return {
          type: 'mdxJsxFlowElement',
          name: 'Mermaid',
          attributes: [
            { type: 'mdxJsxAttribute', name: 'chart', value: child.value ?? '' },
          ],
          children: [],
        };
      }
      walk(child);
      return child;
    });
  };
  return (tree: MdastNode) => {
    walk(tree);
  };
}

/**
 * 把行内的 <Badge type="..." text="..." /> 提升为真正的 Badge 组件元素。
 *
 * `.md` 里的尖括号标签只会被当作原始 HTML（标签名被转小写、属性原样保留），组件永远不会
 * 参与渲染；这里按 Mermaid 的同一手法显式换成一个内联 JSX 元素，交给
 * `markdown.globalComponents` 注册的 Badge 处理。
 */
function remarkBadge() {
  const ATTRIBUTE = /(type|text)\s*=\s*"([^"]*)"/g;
  const walk = (node: MdastNode) => {
    if (!node.children) return;
    node.children = node.children.map((child) => {
      const matched =
        child.type === 'html' &&
        /^<Badge\s+[^>]*\/>$/.test(child.value ?? '') &&
        /<Badge\s+([^>]*?)\s*\/>/.exec(child.value ?? '');
      if (!matched) {
        walk(child);
        return child;
      }
      return {
        type: 'mdxJsxTextElement',
        name: 'Badge',
        attributes: [...matched[1].matchAll(ATTRIBUTE)].map(([, name, value]) => ({
          type: 'mdxJsxAttribute',
          name,
          value,
        })),
        children: [],
      };
    });
  };
  return (tree: MdastNode) => {
    walk(tree);
  };
}

// https://rspress.rs/
export default defineConfig({
  root: '.',
  lang: 'zh-CN',
  title: 'ARS',
  description:
    'ARS 是一个可私有部署的多租户知识智能体平台，统一 RAG、知识图谱、LangGraph 多智能体、MCP/Skills、沙盒与权限管理。',
  base: '/KnowAgenticRAG/',
  // 站点图标就是 SPA 的 favicon（React 标）：`docs/public/favicon.svg` 与
  // `web/public/favicon.svg` 是同一份内容，替换时要两个文件一起换。
  icon: '/favicon.svg',
  logo: '/favicon.svg',
  logoText: 'ARS',
  siteOrigin: SITE_ORIGIN,
  head: [
    ['meta', { name: 'theme-color', content: '#023944' }],
    [
      'meta',
      {
        name: 'keywords',
        content:
          'ARS, AI Agent, RAG, knowledge graph, LangGraph, MCP, self-hosted, multi-agent, knowledge base',
      },
    ],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'ARS' }],
    ['meta', { property: 'og:title', content: 'ARS · 可私有部署的多租户知识智能体平台' }],
    [
      'meta',
      {
        property: 'og:description',
        content: '将 RAG、知识图谱、多智能体执行、MCP/Skills、沙盒与权限管理放进同一个工作台。',
      },
    ],
    [
      'meta',
      {
        property: 'og:image',
        content:
          'https://xerrors.oss-cn-shanghai.aliyuncs.com/posts/2026/08/20260818-151118-mac-1787037059154-8c08f48c.png',
      },
    ],
    ['meta', { property: 'og:image:width', content: '1280' }],
    ['meta', { property: 'og:image:height', content: '640' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'ARS · Self-hosted knowledge agent platform' }],
    [
      'meta',
      {
        name: 'twitter:description',
        content:
          'RAG, knowledge graphs, multi-agent execution, MCP/Skills, sandboxed artifacts, and access control in one workspace.',
      },
    ],
    [
      'meta',
      {
        name: 'twitter:image',
        content:
          'https://xerrors.oss-cn-shanghai.aliyuncs.com/posts/2026/08/20260818-151118-mac-1787037059154-8c08f48c.png',
      },
    ],
  ],
  plugins: [pluginSitemap({ siteUrl: SITE_ORIGIN })],
  // RSPress 的 dev restart 监听器把 watchFiles.options.ignored 写成字符串 glob，而 rsbuild
  // 内置的 chokidar 只认函数或正则，字符串会被当成字面路径，node_modules 因此没有被真正
  // 豁免。RSPack 持久缓存每次写 node_modules/.cache/rspack（*.pack 与 .temp/*.lock）都会
  // 触发「重启 → 写缓存 → 再重启」，dev server 永远到不了 ready。mergeRsbuildConfig 按条目
  // 拼接 dev.watchFiles，配置层无法替换掉那一条，所以关掉持久缓存：CI 构建没有缓存复用，
  // 本地重建实测仍在 2 秒量级。
  builderConfig: {
    performance: { buildCache: false },
  },
  // 内容根就在这里，而 RSPress 把 .ts/.tsx/.js 也当作页面候选：不排除的话配置本身与
  // theme/ 会变成路由，把 Node 侧的 @rsbuild/core 拖进客户端产物；doc_build/ 里的
  // 产物 .js 同理，会让第二次构建去找上一次的 chunk 而失败。
  route: {
    exclude: ['rspress.config.ts', 'theme/**', 'doc_build/**'],
  },
  markdown: {
    remarkPlugins: [remarkMermaid, remarkBadge],
    globalComponents: [MERMAID_COMPONENT, BADGE_COMPONENT],
    link: {
      checkDeadLinks: {
        // 指向 docs/ 之外的真实仓库文件（仓库根 CONTRIBUTING.md、docker-compose.yml）：
        // 站点内没有对应页面，但链接本身有效。
        excludes: (url: string) =>
          /(^|\/)CONTRIBUTING\.md$/.test(url) || /(^|\/)docker-compose\.yml$/.test(url),
      },
    },
  },
  themeConfig: {
    nav: [
      { text: '项目介绍', link: '/intro/project-overview' },
      { text: '快速开始', link: '/intro/quick-start' },
      { text: '智能体开发', link: '/agents/agents-config' },
      { text: '机制详解', link: '/mechanisms/' },
      { text: 'English', link: `${REPO_BLOB}/blob/main/README.en.md` },
    ],

    // 单一根路径分组：全站共用同一套侧边栏。
    sidebar: {
      '/': [
        {
          text: '简介',
          items: [
            { text: '什么是 ARS？', link: '/intro/project-overview' },
            { text: '快速开始', link: '/intro/quick-start' },
            { text: '命令行工具', link: '/intro/cli' },
            { text: '模型配置', link: '/intro/model-config' },
            { text: '知识库与知识图谱', link: '/intro/knowledge-base' },
            { text: '知识库评估', link: '/intro/evaluation' },
          ],
        },
        {
          text: '智能体开发',
          items: [
            { text: '智能体配置', link: '/agents/agents-config' },
            { text: 'Agent 请求队列', link: '/agents/agent-request-queue' },
            { text: '工具系统', link: '/agents/tools-system' },
            { text: '中间件', link: '/agents/middleware' },
            { text: '智能体评估', link: '/agents/agent-evaluation' },
            { text: '沙盒配置与运维', link: '/agents/sandbox-architecture' },
            { text: 'MCP 集成', link: '/agents/mcp-integration' },
            { text: 'Skills 管理', link: '/agents/skills-management' },
            { text: '子智能体', link: '/agents/subagents-management' },
          ],
        },
        {
          text: '机制详解',
          items: [
            { text: '阅读路径', link: '/mechanisms/' },
            { text: '沙盒与文件系统', link: '/mechanisms/sandbox' },
            { text: 'Summary 上下文压缩', link: '/mechanisms/context-compression' },
            { text: '知识库', link: '/mechanisms/knowledge-base' },
          ],
        },
        {
          text: '高级配置',
          items: [
            { text: '配置系统详解', link: '/advanced/configuration' },
            { text: 'Langfuse 集成', link: '/advanced/langfuse-integration' },
            { text: '文档解析', link: '/advanced/document-processing' },
            { text: '知识库管理与 API', link: '/advanced/knowledge-base-operations' },
            { text: '品牌自定义', link: '/advanced/branding' },
            { text: '其他配置', link: '/advanced/misc' },
            { text: '生产部署', link: '/advanced/deployment' },
            { text: 'API Key 外部集成', link: '/advanced/api-key-integration' },
            { text: '第三方认证', link: '/advanced/third-party-auth' },
          ],
        },
        {
          text: '开发指南',
          items: [
            { text: '参与贡献', link: '/develop-guides/contributing' },
            { text: '文档编写与维护', link: '/develop-guides/documentation-guidelines' },
            { text: '开发路线图', link: '/develop-guides/roadmap' },
            { text: '版本变更记录', link: '/develop-guides/changelog' },
            { text: '界面设计规范', link: '/develop-guides/design' },
            { text: '测试规范', link: '/develop-guides/testing-guidelines' },
            { text: 'ARS Spec Loop', link: '/develop-guides/spec-loop' },
            { text: '工程信任系统', link: '/develop-guides/engineering-trust' },
            { text: '工程决策记录', link: '/develop-guides/decisions/README' },
            { text: '工程事故复盘', link: '/develop-guides/postmortems/README' },
          ],
        },
      ],
    },

    socialLinks: [{ icon: 'github', mode: 'link', content: REPO_BLOB }],

    footer: {
      message: '本项目基于 MIT License 开源，欢迎使用和贡献。<br/>Copyright © 2025-present ARS',
    },

    editLink: {
      docRepoBaseUrl: `${REPO_BLOB}/edit/main/docs`,
    },

    lastUpdated: true,

    search: true,
  },
});
