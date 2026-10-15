/** 个人空间文件搜索弹窗。 */
import * as React from 'react';
import { FileSearch } from 'lucide-react';

import { Input, Modal, Spin, type InputRef } from 'antd';

import { useWorkspaceSearch } from '@/entities/workspace';
import { useDebouncedValue } from '@/shared/lib';
import type { FileEntry } from '@/shared/lib/files';
import { resolveFileIconUrl } from '@/shared/lib/files';
import { formatResultDate, splitSnippet } from '@/shared/lib';
import { describeFailure } from '@/shared/api';

import styles from './workspace-search-modal.module.css';

/** 文件搜索的防抖时长。 */
const SEARCH_DEBOUNCE_MS = 250;

type WorkspaceSearchModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (entry: FileEntry) => void;
};

export const WorkspaceSearchModal = ({
  open,
  onOpenChange,
  onSelect,
}: WorkspaceSearchModalProps) => {
  const [query, setQuery] = React.useState('');
  // 选中项与它所属的关键词绑在一起：换了关键词就等于回到第一条，不需要额外的同步效果
  const [active, setActive] = React.useState({ keyword: '', index: 0 });
  const inputRef = React.useRef<InputRef | null>(null);

  const debounced = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const search = useWorkspaceSearch(debounced, open);
  const keyword = debounced.trim();
  const results = keyword ? search.entries : [];
  const activeIndex =
    active.keyword === keyword
      ? Math.min(active.index, Math.max(0, results.length - 1))
      : 0;

  const close = () => {
    setQuery('');
    setActive({ keyword: '', index: 0 });
    onOpenChange(false);
  };

  const errorText = search.error
    ? describeFailure(search.error, '搜索失败，请重试')
    : '';

  const pick = (entry: FileEntry) => {
    close();
    onSelect(entry);
  };

  const moveActive = (step: number) => {
    if (!results.length) return;
    setActive({
      keyword,
      index: (activeIndex + step + results.length) % results.length,
    });
  };

  const onInputKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
      return;
    }
    if (event.key === 'Enter') {
      const entry = results[activeIndex];
      if (entry) pick(entry);
    }
  };

  return (
    <Modal
      open={open}
      footer={null}
      closable={false}
      width={680}
      afterOpenChange={(visible) => {
        if (visible) inputRef.current?.focus();
      }}
      onCancel={close}
      styles={{ body: { padding: 12 } }}
    >
      <div className={styles.shell}>
        <Input
          ref={inputRef}
          value={query}
          placeholder="搜索个人空间文件..."
          prefix={<FileSearch size={14} aria-hidden />}
          aria-label="搜索个人空间文件"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onInputKeyDown}
        />

        <div className={styles.results}>
          {search.isLoading ? (
            <div className={styles.state}>
              <Spin size="small" />
            </div>
          ) : errorText ? (
            <div className={styles.error}>{errorText}</div>
          ) : results.length ? (
            results.map((entry, index) => (
              <button
                key={entry.path}
                type="button"
                className={`${styles.result} ${
                  index === activeIndex ? styles.resultActive : ''
                }`}
                onMouseEnter={() => setActive({ keyword, index })}
                onClick={() => pick(entry)}
              >
                <img
                  src={resolveFileIconUrl(entry.path, { isDir: entry.isDir })}
                  alt=""
                  className={styles.resultIcon}
                />
                <span className={styles.resultMain}>
                  <span className={styles.resultTitle}>
                    {splitSnippet(entry.name || entry.path, keyword).map(
                      (part, partIndex) =>
                        part.match ? (
                          <mark key={partIndex}>{part.text}</mark>
                        ) : (
                          <span key={partIndex}>{part.text}</span>
                        ),
                    )}
                  </span>
                  <span className={styles.resultPath}>{entry.path}</span>
                </span>
                <span className={styles.resultDate}>
                  {formatResultDate(entry.modifiedAt)}
                </span>
              </button>
            ))
          ) : keyword ? (
            <div className={styles.state}>未找到相关文件</div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
};
