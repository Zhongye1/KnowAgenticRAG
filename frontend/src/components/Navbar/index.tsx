import React from 'react';

import { DayNightSwitcher } from '@/components/ui/DayNightSwitcher';

const NAV_LINKS = [
  {
    label: 'Github',
    href: 'https://github.com/Zhongye1/KnowledgeRAG-OGAS',
  },
  { label: '相关文档', href: 'https://github.com/Zhongye1' },
  { label: '作者主页', href: 'https://github.com/Zhongye1' },
] as const;

export function NavBar() {
  return (
    <header
      aria-label="顶部导航"
      className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-color-border-2 px-6 backdrop-blur-sm"
    >
      {/* Logo */}
      <a href="/" className="flex items-center gap-2 text-lg font-black">
        RAGF
      </a>

      {/* 链接组与主题切换 */}
      <div className="flex items-center gap-6">
        <nav className="flex items-center">
          {NAV_LINKS.map(({ label, href }, i) => (
            <React.Fragment key={label}>
              {i > 0 && (
                <span aria-hidden className="mx-4 h-3.5 w-px bg-color-border-2" />
              )}
              <a
                href={href || undefined}
                rel={href ? 'noopener noreferrer' : undefined}
                aria-disabled={!href}
                onClick={(e) => {
                  if (!href) e.preventDefault();
                }}
                className="
                  relative text-sm text-color-text-2 transition-colors duration-300
                  hover:text-primary-6
                  after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-full
                  after:origin-left after:scale-x-0 after:bg-current after:transition-transform
                  after:duration-300 hover:after:scale-x-100
                  aria-disabled:pointer-events-none aria-disabled:text-color-text-4
                "
              >
                {label}
              </a>
            </React.Fragment>
          ))}
        </nav>
        <DayNightSwitcher />
      </div>
    </header>
  );
}
