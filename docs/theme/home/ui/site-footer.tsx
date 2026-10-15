/** 首页页脚：品牌 + 状态与版权 + 右侧入口，单行。站内入口走 `Link` 以带上 base 前缀。 */
import { Link } from '@theme';

import { outbound } from '../lib/links';

export const SiteFooter = () => (
  <footer className="home-footer">
    <div className="home-shell footer-row">
      <div className="footer-left">
        <div className="footer-brand">
          <span className="footer-name">KnowAgenticRAG</span>
        </div>
      </div>

      <nav className="footer-links" aria-label="页脚导航">
        <Link href={outbound.docs}>文档</Link>
        <a href={outbound.repo} target="_blank" rel="noreferrer">
          GitHub <span aria-hidden="true">↗</span>
        </a>
      </nav>
    </div>
  </footer>
);
