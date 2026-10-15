/** 首页顶栏。文案、logo 地址与工具类都写在这里，不读接口。 */
import * as React from 'react';
import { Link } from 'react-router';

import { BRAND_LOGO_URL, paths } from '@/shared/config';

import { outbound } from '../lib/links';

export const SiteHeader = ({ isLoggedIn }: { isLoggedIn: boolean }) => {
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
        <Link className="wordmark flex items-center gap-3" to={paths.home.getHref()}>
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
            <a
              className="relative whitespace-nowrap px-[13px] py-3 max-[721px]:px-0 max-[721px]:py-[14px]"
              href={outbound.docs}
            >
              文档
            </a>
            <a
              className="relative whitespace-nowrap px-[13px] py-3 max-[721px]:px-0 max-[721px]:py-[14px]"
              href={outbound.repo}
              target="_blank"
              rel="noreferrer"
            >
              GitHub ↗
            </a>
            {isLoggedIn ? (
              <Link
                className="relative whitespace-nowrap px-[13px] py-3 max-[721px]:px-0 max-[721px]:py-[14px]"
                to={paths.app.chat.getHref()}
              >
                进入控制台
              </Link>
            ) : (
              <Link
                className="relative whitespace-nowrap px-[13px] py-3 max-[721px]:px-0 max-[721px]:py-[14px]"
                to={paths.auth.login.getHref(paths.home.getHref())}
              >
                登录
              </Link>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
};
