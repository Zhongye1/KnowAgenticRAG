/**
 * 首页页脚：内容照搬参照实现的 `site-footer.tsx`。
 *
 * 与参照的差异：不搬用品牌 SVG 做遮罩的 `.home-footer-logo`（第三方品牌资产）；
 * 「Legal」与「Documentation」指向本仓协议页与文档站（参照指向它自己的站点）。
 *
 * 来源：AI Website Cloner Template 0.6.1（MIT，JCodesMore）里的 AusVector 首页克隆。
 */
import { outbound } from '../lib/links';

export const SiteFooter = () => {
  return (
    <footer className="home-footer">
      <div className="site-shell">
        <div className="footer-wrap home-footer-inner">
          <div className="home-footer-status" aria-label="Platform data scope">
            <span>PRIVATE BETA ACCESS</span>
          </div>
          <div className="home-footer-main">
            <span className="home-footer-mark">
              <span aria-hidden="true">/ OPEN DATA FOR AI</span>
            </span>
            <span>© 2026 Ausdata Science Pty Ltd</span>
            <a className="footer-legal-link" href={outbound.privacyPolicy}>
              Legal
            </a>
            <a href={outbound.docs}>Documentation →</a>
          </div>
        </div>
      </div>
    </footer>
  );
};
