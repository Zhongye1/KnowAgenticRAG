import * as React from 'react';

import { copyTextToClipboard } from '@/shared/lib/clipboard';
import { renderMarkdown, type MarkdownTheme } from '@/shared/markdown';

type MarkdownProps = {
  content: string;
  /** 亮暗主题；切换时重新渲染高亮结果。 */
  theme?: MarkdownTheme | string | null;
  className?: string;
  /** 给每个代码块挂一个复制按钮；默认关闭，只有需要它的调用点打开。 */
  codeCopy?: boolean;
};

const CODE_COPY_IDLE = '复制';
const CODE_COPY_DONE = '已复制';
const CODE_COPY_FEEDBACK_MS = 2000;

const CODE_COPY_CLASS =
  'absolute right-2 top-2 rounded-small border border-color-border-1 bg-color-bg-2 px-2 py-0.5 text-xs text-color-text-2';

/**
 * Markdown 渲染组件。
 *
 * 渲染结果来自 `renderMarkdown`（已消毒），因此这里用 `dangerouslySetInnerHTML`。
 * 流式内容会按帧重渲，渲染管线内部有按内容缓存，避免重复解析。
 *
 * `codeCopy` 打开时，渲染完成后往每个 `<pre>` 里插一个复制按钮：按钮由本组件自己创建、
 * 不经过消毒管线，监听直接挂在按钮上（容器因此不需要点击处理），反馈写在按钮文案里。
 */
export const Markdown = ({
  content,
  theme,
  className,
  codeCopy = false,
}: MarkdownProps) => {
  const [html, setHtml] = React.useState('');
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    void renderMarkdown(content, { theme }).then((next) => {
      if (!cancelled) setHtml(next);
    });
    return () => {
      cancelled = true;
    };
  }, [content, theme]);

  React.useEffect(() => {
    if (!codeCopy) return;

    const container = containerRef.current;
    if (!container) return;

    const cleanups: Array<() => void> = [];

    for (const pre of container.querySelectorAll('pre')) {
      if (pre.querySelector('button[data-code-copy]')) continue;

      // 按钮绝对定位到代码块右上角；<pre> 默认不是定位祖先
      pre.style.position = 'relative';

      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.codeCopy = 'true';
      button.setAttribute('aria-label', '复制代码');
      button.className = CODE_COPY_CLASS;
      button.textContent = CODE_COPY_IDLE;

      let feedbackTimer = 0;
      const onClick = () => {
        const code = pre.querySelector('code')?.textContent ?? '';
        void copyTextToClipboard(code).then((copied) => {
          if (!copied) {
            // 复制失败不改按钮文案：按钮上的「已复制」就是成功的唯一凭据
            console.error('复制代码失败');
            return;
          }
          button.textContent = CODE_COPY_DONE;
          window.clearTimeout(feedbackTimer);
          feedbackTimer = window.setTimeout(() => {
            button.textContent = CODE_COPY_IDLE;
          }, CODE_COPY_FEEDBACK_MS);
        });
      };

      button.addEventListener('click', onClick);
      pre.appendChild(button);

      cleanups.push(() => {
        window.clearTimeout(feedbackTimer);
        button.removeEventListener('click', onClick);
        button.remove();
      });
    }

    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [html, codeCopy]);

  return (
    <div
      ref={containerRef}
      className={className}
      // 内容已由 renderMarkdown 经 DOMPurify 消毒
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
