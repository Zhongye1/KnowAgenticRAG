/**
 * 首页顶栏：结构照搬参照实现的 `site-header.tsx`。
 *
 * 与参照的差异：
 * - `next/link` 换成 `react-router` 的 `Link`；
 * - wordmark 的品牌图与「A」标记换成系统信息接口的 `organization.logo` 与品牌名；
 * - 导航链接指向本仓入口（文档站、仓库，以及按登录态的「进入控制台 / 登录」）：
 *   参照的三条链接是它自己的 Playground、文档与 ausdata.ai，本仓没有对应页面。
 * - 移动端面板的 Escape 与断点关闭逻辑照搬。
 *
 * 来源：AI Website Cloner Template 0.6.1（MIT，JCodesMore）里的 AusVector 首页克隆。
 */
import * as React from 'react';
import { Link } from 'react-router';

import { paths } from '@/shared/config';

import { outbound } from '../lib/links';

type SiteHeaderProps = {
  brandName: string;
  logo: string;
  isLoggedIn: boolean;
};

export const SiteHeader = ({
  brandName,
  logo,
  isLoggedIn,
}: SiteHeaderProps) => {
  const [isOpen, setIsOpen] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    const media = window.matchMedia('(min-width: 721px)');
    const onBreakpoint = () => {
      if (media.matches) setIsOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    media.addEventListener('change', onBreakpoint);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      media.removeEventListener('change', onBreakpoint);
    };
  }, [isOpen]);

  return (
    <header className="site-shell nav-shell">
      <nav
        className={`nav-wrap ${isOpen ? 'is-open' : ''}`}
        aria-label="Primary navigation"
      >
        <Link className="wordmark" to={paths.home.getHref()}>
          {logo ? (
            <span className="wordmark-logo-wrap">
              <img className="wordmark-logo" src={logo} alt="" />
            </span>
          ) : null}
          <span className="wordmark-text-group">
            <span className="wordmark-title">{brandName}</span>
            <span className="wordmark-divider" aria-hidden="true">
              /
            </span>
            <span className="wordmark-badge">
              <span className="wordmark-status-pulse" aria-hidden="true">
                <span className="pulse-core" />
                <span className="pulse-ring" />
              </span>
              <span className="wordmark-badge-label wordmark-desktop-label">
                OPEN DATA FOR AI
              </span>
              <span className="wordmark-badge-label wordmark-mobile-label">
                AI DATA
              </span>
            </span>
          </span>
        </Link>

        <button
          className="nav-menu-button"
          type="button"
          aria-expanded={isOpen}
          aria-controls="site-navigation-menu"
          aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
          onClick={() => setIsOpen((open) => !open)}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>

        <div className="nav-actions" id="site-navigation-menu">
          <div className="nav-links">
            <a href={outbound.docs}>Documentation</a>
            <a href={outbound.repo} target="_blank" rel="noreferrer">
              GitHub ↗
            </a>
            {isLoggedIn ? (
              <Link to={paths.app.chat.getHref()}>进入控制台</Link>
            ) : (
              <Link to={paths.auth.login.getHref(paths.home.getHref())}>
                登录
              </Link>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
};
