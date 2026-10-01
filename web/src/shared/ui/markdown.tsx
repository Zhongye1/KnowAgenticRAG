import * as React from 'react';

import { renderMarkdown, type MarkdownTheme } from '@/shared/markdown';

type MarkdownProps = {
  content: string;
  /** 亮暗主题；切换时重新渲染高亮结果。 */
  theme?: MarkdownTheme | string | null;
  className?: string;
};

/**
 * Markdown 渲染组件。
 *
 * 渲染结果来自 `renderMarkdown`（已消毒），因此这里用 `dangerouslySetInnerHTML`。
 * 流式内容会按帧重渲，渲染管线内部有按内容缓存，避免重复解析。
 */
export const Markdown = ({ content, theme, className }: MarkdownProps) => {
  const [html, setHtml] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    void renderMarkdown(content, { theme }).then((next) => {
      if (!cancelled) setHtml(next);
    });
    return () => {
      cancelled = true;
    };
  }, [content, theme]);

  return (
    <div
      className={className}
      // 内容已由 renderMarkdown 经 DOMPurify 消毒
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
