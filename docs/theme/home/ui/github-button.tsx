/**
 * Hero 的第二个按钮：GitHub 入口 + 仓库 star 数。
 *
 * star 数在客户端取一次 GitHub 公开 API（站点是静态站，没有构建期取数的位置）；取不到
 * ——离线、限流、被墙——就只渲染「GitHub ↗」，不写死一个会过期的数字，也不显示 0。
 *
 * 仓库地址来自 `href`，API 路径由它推导：改仓库时只改一处链接。
 */
import { Star } from 'lucide-react';
import * as React from 'react';

import { Github } from '../lib/brand-logos';

/** `https://github.com/owner/name` → `repos/owner/name`；不是仓库地址时返回空串。 */
const toApiPath = (repoUrl: string) => {
  try {
    const path = new URL(repoUrl).pathname.replace(/^\/+/, '').replace(/\.git$/, '');
    return path ? `repos/${path}` : '';
  } catch {
    return '';
  }
};

export const GitHubButton = ({
  className,
  href,
}: {
  className?: string;
  href: string;
}) => {
  const [stars, setStars] = React.useState<number | null>(null);

  React.useEffect(() => {
    const apiPath = toApiPath(href);
    // 没有 fetch（jsdom 等）时不可用，直接不显示数字
    if (!apiPath || typeof fetch !== 'function') return;

    const controller = new AbortController();
    fetch(`https://api.github.com/${apiPath}`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { stargazers_count?: number } | null) => {
        if (typeof data?.stargazers_count === 'number') {
          setStars(data.stargazers_count);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [href]);

  return (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {/* 品牌标是 Mono 形态（currentColor），与按钮文字同色；图标自带 <title>，这里对辅助技术隐藏 */}
      <Github size={16} aria-hidden="true" />
      GitHub
      {stars === null ? null : (
        <span className="flex items-center gap-1">
          <Star size={14} strokeWidth={0} fill="currentColor" aria-hidden="true" />
          {stars.toLocaleString('en-US')}
        </span>
      )}
      <span aria-hidden="true">↗</span>
    </a>
  );
};
