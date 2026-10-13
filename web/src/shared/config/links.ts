/**
 * 全站共用的站外链接。
 *
 * 事实 Owner 在这里：外壳与首页都引用它，页面不各自再写一份域名。
 * 文档站由 `.github/workflows/deploy.yml` 发布到 Pages，VitePress base 是 `/KnowledgeRAG-OGAS/`。
 */

/** 文档站根地址。 */
export const DOCS_URL = 'https://zhongye1.github.io/KnowledgeRAG-OGAS/';

/** 仓库地址，导航列与首页顶栏共用。 */
export const REPO_URL = 'https://github.com/Zhongye1/KnowledgeRAG-OGAS';
