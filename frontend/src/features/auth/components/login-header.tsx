import React from 'react';

const NAV_LINKS = [
  {
    label: 'Github',
    href: 'https://github.com/Zhongye1/KnowledgeRAG-OGAS',
  },
  { label: '相关文档', href: 'https://github.com/Zhongye1' },
  { label: '作者主页', href: 'https://github.com/Zhongye1' },
] as const;

export function LoginHeader() {
  return (
    <header
      aria-label="顶部导航"
      className="flex h-14 items-center justify-between border-b border-color-border-1 bg-color-bg-2 px-6"
    >
      {/* 左：Logo */}
      <a href="/" className="flex items-center gap-2 text-lg font-black">
        RAGF
      </a>

      {/* 右：链接组 */}
      <nav className="flex items-center">
        {NAV_LINKS.map(({ label, href }, i) => (
          <React.Fragment key={label}>
            {i > 0 && (
              <span aria-hidden className="mx-4 h-3.5 w-px bg-color-border-2" />
            )}
            <a
              href={href || undefined}
              rel="noopener noreferrer"
              aria-disabled={!href}
              onClick={(e) => {
                if (!href) e.preventDefault();
              }}
              className="
    relative text-sm text-color-text-2
    hover:text-primary-6
    bg-[linear-gradient(currentColor,currentColor)] bg-no-repeat bg-left-bottom
    bg-[length:0%_2px] hover:bg-[length:100%_2px]
    transition-[background-size] duration-300 ease-out
    aria-disabled:bg-[length:0%_2px] aria-disabled:hover:text-color-text-4
    aria-disabled:cursor-not-allowed
  "
            >
              {label}
            </a>
          </React.Fragment>
        ))}
      </nav>
    </header>
  );
}
