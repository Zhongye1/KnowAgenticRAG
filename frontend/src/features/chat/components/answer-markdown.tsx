import { useMessagePartText } from '@assistant-ui/react';
import { useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { defaultMarkdownComponents } from '@/components/assistant-ui/elements/markdown-text';

import { CitationChip } from './citation-chip';
import { useChatRunInfo } from '../hooks/use-chat-run-info';

/**
 * 助手回答渲染：在标准 markdown 之上，把正文中 [n] 标注替换为可溯源的
 * 引用角标（citation 事件已到达且编号匹配时），其余按默认 markdown 渲染。
 */

const CITATION_LINK_PATTERN = /^#cite-(\d{1,3})$/;
const CITATION_MARKER_PATTERN = /\[(\d{1,3})\]/g;

export const AnswerMarkdown = () => {
  const { text } = useMessagePartText();
  const citations = useChatRunInfo()?.citations;

  const components = useMemo<Components>(
    () => ({
      ...defaultMarkdownComponents,
      a: ({ className, href, children, ...props }) => {
        const match = typeof href === 'string' ? CITATION_LINK_PATTERN.exec(href) : null;
        if (match) {
          const n = Number(match[1]);
          return (
            <CitationChip n={n} citation={citations?.find((c) => c.n === n)} />
          );
        }
        return (
          <a
            className={
              className ?? 'aui-md-a text-primary hover:text-primary/80 underline underline-offset-2'
            }
            href={href}
            target="_blank"
            rel="noreferrer"
            {...props}
          >
            {children}
          </a>
        );
      },
    }),
    [citations],
  );

  const rendered = useMemo(() => {
    if (!citations?.length) return text;
    return text.replace(CITATION_MARKER_PATTERN, (raw, nStr: string) => {
      const n = Number(nStr);
      return citations.some((c) => c.n === n) ? `[${n}](#cite-${n})` : raw;
    });
  }, [text, citations]);

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {rendered}
    </ReactMarkdown>
  );
};
