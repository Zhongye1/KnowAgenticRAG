/**
 * 文档站首页顶栏。文案、logo 与工具类与 SPA 首页一致，入口改指文档页面。
 *
 * SPA 版的第三项是会话入口（登录 / 进入控制台），文档站没有登录态，因此换成「快速开始」。
 * 站内链接走 `@theme` 的 `Link`：它补 base 前缀并做客户端跳转。
 */
import { Link } from '@theme';
import * as React from 'react';

import { BRAND_LOGO_URL, outbound } from '../lib/links';

export const SiteHeader = () => {
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
    <header className="nav-shell sticky top-0 z-50 w-full p-0">
      <nav
        className={`nav-wrap home-shell flex min-h-16 items-center py-3 max-[721px]:flex-wrap max-[721px]:gap-0 max-[721px]:py-2.5 ${isOpen ? 'is-open' : ''}`}
        aria-label="主导航"
      >
        <Link className="wordmark flex items-center gap-3" href={outbound.home}>
          <img
            className="block size-8 object-contain max-[721px]:size-[26px]"
            src={BRAND_LOGO_URL}
            alt=""
          />
          <span className="text-[17px] font-semibold whitespace-nowrap select-none">
            KnowAgenticRAG
          </span>
        </Link>

        <button
          className="nav-menu-button hidden size-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-[4px] border-none bg-transparent p-0 max-[721px]:ml-auto max-[721px]:flex max-[721px]:shrink-0"
          type="button"
          aria-expanded={isOpen}
          aria-controls="site-navigation-menu"
          aria-label={isOpen ? '关闭导航菜单' : '打开导航菜单'}
          onClick={() => setIsOpen((open) => !open)}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>

        <div
          className="nav-actions ml-auto flex items-center gap-3.5"
          id="site-navigation-menu"
        >
          <div className="nav-links flex gap-1 max-[721px]:flex-col max-[721px]:items-stretch max-[721px]:gap-0">
            <Link
              className="relative whitespace-nowrap px-[13px] py-3 max-[721px]:px-0 max-[721px]:py-[14px]"
              href={outbound.docs}
            >
              文档
            </Link>
            <a
              className="relative whitespace-nowrap px-[13px] py-3 max-[721px]:px-0 max-[721px]:py-[14px]"
              href={outbound.repo}
              target="_blank"
              rel="noreferrer"
            >
              GitHub ↗
            </a>
            <Link
              className="relative whitespace-nowrap px-[13px] py-3 max-[721px]:px-0 max-[721px]:py-[14px]"
              href={outbound.docsQuickStart}
            >
              快速开始
            </Link>
          </div>
        </div>
      </nav>
    </header>
  );
};
