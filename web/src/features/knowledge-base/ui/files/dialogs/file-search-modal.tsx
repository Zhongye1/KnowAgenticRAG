/**
 * 文件名搜索弹窗。
 *
 * 命令面板式弹窗、防抖后按文件名搜索、结果展示状态/大小/更新时间，选中一条后回到它所在的
 * 目录；说明文字写明「仅匹配文件名，不搜索文件内容」（正文检索在 Agent 侧）。
 *
 * 输入状态随组件卸载清空：页面只在打开时挂载它，因此不需要「关闭时重置」的 effect；
 * 焦点由 Radix Dialog 的自动聚焦负责。
 */
import * as React from 'react';
import { FileText } from 'lucide-react';
import { Button, Empty, Input, Modal, Spin, Tag } from 'antd';

import type { KnowledgeFileSearchItem } from '../../../api/knowledge-api';
import {
  formatDirname,
  formatSearchResultTime,
  getFileStatusView,
  splitFilename,
} from '../../../lib/knowledge-files';
import { formatBytes } from '../../../lib/knowledge-view';
import { useSearchKnowledgeFiles } from '../../../model/knowledge-queries';

/** 自动搜索的防抖时长。 */
const SEARCH_DEBOUNCE_MS = 240;

type FileSearchModalProps = {
  kbId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 选中一个文件：回到它所在的目录。 */
  onSelect: (file: KnowledgeFileSearchItem) => void;
};

export const FileSearchModal = ({
  kbId,
  open,
  onOpenChange,
  onSelect,
}: FileSearchModalProps) => {
  const [keyword, setKeyword] = React.useState('');
  const [submitted, setSubmitted] = React.useState('');

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setSubmitted(keyword.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  const results = useSearchKnowledgeFiles(kbId, submitted);
  const files = results.data?.files ?? [];

  return (
    <Modal
      open={open}
      onCancel={() => onOpenChange(false)}
      footer={null}
      title={
        <div>
          <div>搜索文件</div>
          <div className="text-xs font-normal text-color-text-3">
            仅匹配文件名，不搜索文件内容。
          </div>
        </div>
      }
    >
      <Input
        value={keyword}
        aria-label="搜索文件名"
        placeholder="输入文件名关键词"
        onChange={(event) => setKeyword(event.target.value)}
      />
      {submitted && results.isFetching ? (
        <div className="flex items-center gap-2 py-4 text-sm text-color-text-3">
          <Spin aria-hidden className="size-4" />
          正在搜索…
        </div>
      ) : null}
      {submitted && results.isError ? (
        <p role="alert" className="py-4 text-sm text-danger-6">
          {results.error instanceof Error
            ? results.error.message
            : '搜索失败。'}
        </p>
      ) : null}
      {submitted && results.isSuccess && files.length === 0 ? (
        <Empty description="未找到匹配的文件" />
      ) : null}
      {files.length > 0 ? (
        <ul
          className="flex max-h-80 flex-col gap-1 overflow-y-auto"
          aria-label="搜索结果"
        >
          {files.map((file) => {
            const view = getFileStatusView(file.status);
            const { basename, dirname } = splitFilename(file.filename);
            return (
              <li key={file.file_id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-medium border-0 bg-transparent px-2 py-2 text-left hover:bg-sidebar-accent"
                  onClick={() => {
                    onSelect(file);
                    onOpenChange(false);
                  }}
                >
                  <FileText
                    className="size-4 shrink-0 text-color-text-3"
                    aria-hidden
                  />
                  <span className="flex min-w-0 flex-1 items-baseline gap-2">
                    <span
                      className="truncate text-sm text-color-text-1"
                      title={basename}
                    >
                      {basename}
                    </span>
                    {dirname ? (
                      <span
                        className="shrink-0 truncate text-xs text-color-text-3"
                        title={dirname}
                      >
                        {formatDirname(dirname)}
                      </span>
                    ) : null}
                  </span>
                  <Tag color={view.color} className="m-0 shrink-0">
                    {view.label}
                  </Tag>
                  <span className="shrink-0 text-xs text-color-text-3">
                    {formatBytes(file.file_size ?? undefined)}
                  </span>
                  <span className="shrink-0 text-xs text-color-text-3">
                    {formatSearchResultTime(file.updated_at) || '—'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <p className="text-xs text-color-text-3">
        {submitted
          ? results.data?.has_more
            ? `共 ${results.data.total} 条结果，仅展示前 ${files.length} 条，请细化关键词。`
            : `共 ${results.data?.total ?? 0} 条结果`
          : '输入关键词后按文件名匹配。'}
      </p>
      <div className="flex justify-end">
        <Button
          htmlType="button"
          variant="outlined"
          onClick={() => onOpenChange(false)}
        >
          关闭
        </Button>
      </div>
    </Modal>
  );
};
