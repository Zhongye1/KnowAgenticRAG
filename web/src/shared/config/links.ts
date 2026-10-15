/**
 * 全站共用的站外链接。
 *
 * 事实 Owner 在这里：外壳与首页都引用它，页面不各自再写一份域名。
 * 文档站由 `.github/workflows/deploy.yml` 发布到 Pages，站点路径跟随仓库名，Rspress base
 * 是 `/KnowAgenticRAG/`。
 */

/** 文档站根地址。 */
export const DOCS_URL = 'https://zhongye1.github.io/KnowAgenticRAG/';

/** 仓库地址，导航列与首页顶栏共用（首页的 star 数也从这份地址推导 API 路径）。 */
export const REPO_URL = 'https://github.com/Zhongye1/KnowAgenticRAG';

/**
 * 品牌标识：直接指向 GitHub 头像，不再取后端 organization.logo / avatar。
 * 登录后的导航列与首页顶栏都引用它，页面不再各自内联一份地址。
 */
export const BRAND_LOGO_URL =
  'https://avatars.githubusercontent.com/u/317238479?s=400&u=3872a4747631973b7806f7d77cb9ad212c39cf00&v=4';
