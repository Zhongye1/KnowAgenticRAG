/**
 * 源文件预览的分发。
 *
 * 按后端给的 `preview_type` 决定怎么渲染（图片 / PDF / Markdown / HTML / 文本与代码），
 * 不支持时给出后端的原因。图片与 PDF 用 objectURL，组件卸载或切换文件时释放。
 */
import * as React from 'react';
import { Spin } from 'antd';

import type { KnowledgeFileItem } from '../../../api/knowledge-api';
import { getCodeLanguageByPath } from '../../../lib/file-preview';
import { useFilePreview } from '../../../model/knowledge-queries';
import { Empty } from '@/shared/ui/empty';
import { Markdown } from '@/shared/ui/markdown';
import { useIsDarkMode } from '@/shared/lib';
import { renderCodeBlock } from '@/shared/markdown';
import { PdfPreview } from './pdf-preview';

type FilePreviewProps = {
  kbId: string;
  file: KnowledgeFileItem;
};

/** 文本与代码视图：能认出语言就高亮，认不出按纯文本。 */
const CodePreview = ({
  content,
  path,
  theme,
}: {
  content: string;
  path: string;
  theme: string;
}) => {
  const language = getCodeLanguageByPath(path);
  // 高亮结果连同它的输入一起存：内容变了就当作没有结果，不必在 effect 里重置
  const [rendered, setRendered] = React.useState<{
    input: string;
    html: string;
  } | null>(null);
  const input = `${language}\u0000${content}`;

  React.useEffect(() => {
    let cancelled = false;
    if (!language) return () => undefined;
    void renderCodeBlock(content, language, { theme }).then((next) => {
      if (!cancelled) setRendered({ input, html: next || '' });
    });
    return () => {
      cancelled = true;
    };
  }, [content, language, input, theme]);

  const html = rendered?.input === input ? rendered.html : '';
  if (!html) {
    return (
      <pre className="overflow-x-auto text-xs whitespace-pre-wrap text-color-text-1">
        {content}
      </pre>
    );
  }
  return (
    <div
      className="overflow-x-auto text-xs"
      // 已由 renderCodeBlock 消毒
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export const FilePreview = ({ kbId, file }: FilePreviewProps) => {
  const preview = useFilePreview(kbId, file);
  const markdownTheme = useIsDarkMode() ? 'github-dark' : 'github-light';
  const imageRef = React.useRef<HTMLImageElement>(null);
  const blob = preview.data?.blob ?? null;

  // objectURL 只能在提交后创建，这里直接写到节点上，避免为一个纯展示值再走一次 state
  React.useEffect(() => {
    const node = imageRef.current;
    if (!node || !blob) return undefined;
    const url = URL.createObjectURL(blob);
    node.src = url;
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  if (preview.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-color-text-3">
        <Spin aria-hidden className="size-4" />
        正在加载文件…
      </p>
    );
  }

  if (preview.isError) {
    return (
      <p role="alert" className="text-sm text-danger-6">
        {preview.error instanceof Error
          ? preview.error.message
          : '加载文件预览失败。'}
      </p>
    );
  }

  const data = preview.data;
  if (!data) return <Empty description="没有可预览的内容" />;
  if (!data.supported) {
    return (
      <Empty
        description={data.message || '当前文件暂不支持预览，请下载后查看'}
      />
    );
  }

  switch (data.previewType) {
    case 'image':
      return (
        <img
          ref={imageRef}
          alt={data.filename}
          className="mx-auto max-h-[55vh] rounded-medium"
        />
      );
    case 'pdf':
      // 按文件重挂载：blob 换了就是换了文件，画布与状态都该重来
      return blob ? <PdfPreview key={file.file_id} blob={blob} /> : null;
    case 'markdown':
      return (
        <Markdown
          content={data.content ?? ''}
          theme={markdownTheme}
          className="text-sm text-color-text-1"
        />
      );
    case 'html':
      return (
        <iframe
          title={`${data.filename} 预览`}
          className="h-[55vh] w-full rounded-medium border border-color-border-1"
          sandbox=""
          srcDoc={data.content ?? ''}
        />
      );
    case 'text':
    case 'json':
      return (
        <CodePreview
          content={data.content ?? ''}
          path={data.filename}
          theme={markdownTheme}
        />
      );
    default:
      return (
        <Empty
          description={data.message || '当前文件暂不支持预览，请下载后查看'}
        />
      );
  }
};
