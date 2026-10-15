/**
 * 支持 `@` 提及的输入框。
 *
 * 用 `contenteditable` 而不是 `textarea`：提及要显示成一个整体芯片，而 `textarea` 只能
 * 放纯文本。代价是 DOM 由浏览器拥有，因此这里的规则是——**React 只负责在外部值变化时
 * 重建内容，打字期间不碰 DOM**，否则光标每敲一个字都会跳。
 *
 * 发出去的是序列化后的原始文本（芯片还原成令牌），与用户手打令牌完全一致。
 */
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { resolveFileIconUrl } from '@/shared/lib/files';
import {
  buildEditorFragment,
  getSelectionRawOffset,
  serializeEditorContent,
  setSelectionRawOffset,
} from '../lib/mention-editor';
import {
  buildMentionGroups,
  isEmptyMentionGroups,
  MENTION_SEARCH_DEBOUNCE_MS,
  moveMentionSelection,
  type MentionGroups,
} from '../lib/mention-query';
import type { MentionResourceItem } from '../lib/mention-resources';
import {
  expandMentionDeletionRange,
  findActiveMentionQuery,
  replaceRawRange,
} from '../lib/mention-text';
import {
  getMentionIcon,
  MENTION_ICON_SIZE,
  MENTION_ICON_STROKE_WIDTH,
} from './mention-icons';
import { MentionPopup } from './mention-popup';
import styles from './mention-editor.module.css';

/**
 * 给芯片里的图标占位节点填上真实图标（参照 MessageInputComponent 的 render(h(...))）。
 *
 * 芯片 DOM 由 lib 层创建，React 图标组件进不去，因此挂载/内容重建后走一遍命令式填充：
 * lucide 图标经 renderToStaticMarkup 变成 SVG 标记直接注入，文件类型用彩色 SVG
 * （resolveFileIconUrl，同参照 FileTypeIcon）。
 */
const ICON_MARKUP_CACHE = new Map<string, string>();

const mentionIconMarkup = (type: string): string => {
  const cached = ICON_MARKUP_CACHE.get(type);
  if (cached) return cached;
  const Icon = getMentionIcon(type);
  const markup = renderToStaticMarkup(
    createElement(Icon, {
      size: MENTION_ICON_SIZE,
      strokeWidth: MENTION_ICON_STROKE_WIDTH,
    }),
  );
  ICON_MARKUP_CACHE.set(type, markup);
  return markup;
};

const fillMentionIcons = (root: HTMLElement | null) => {
  if (!root) return;
  const placeholders = root.querySelectorAll<HTMLElement>(
    '.mention-ref-icon[data-mention-icon]',
  );
  for (const holder of placeholders) {
    const type = holder.dataset.mentionIcon ?? '';
    const value = holder.dataset.mentionIconValue ?? '';
    if (type === 'file') {
      const img = document.createElement('img');
      img.src = resolveFileIconUrl(value, { isDir: value.endsWith('/') });
      img.width = MENTION_ICON_SIZE;
      img.height = MENTION_ICON_SIZE;
      img.alt = '';
      img.draggable = false;
      holder.replaceChildren(img);
      continue;
    }
    holder.innerHTML = mentionIconMarkup(type);
  }
};

type MentionEditorProps = {
  value: string;
  onChange: (value: string) => void;
  /** 回车提交；不传时回车只换行。 */
  onSubmit?: () => void;
  placeholder?: string;
  disabled?: boolean;
  /** 固定候选（知识库 / 技能 / MCP / 子智能体）。 */
  configItems?: MentionResourceItem[];
  /** 文件搜索；不传时文件提及不可用。 */
  searchFiles?: (query: string) => Promise<MentionResourceItem[]>;
  /** 芯片展示名映射；见 `buildMentionDisplayLabels`。 */
  displayLabels?: Record<string, string>;
  ariaLabel?: string;
};

/** 命令式接口：供「+」面板从编辑器外部插入一个提及令牌。 */
export type MentionEditorHandle = {
  /** 在光标处插入令牌（光标不在编辑器里时追加到末尾）并聚焦。 */
  insertMentionToken: (item: MentionResourceItem) => void;
};

type PopupState = { start: number; end: number; query: string };

export const MentionEditor = React.forwardRef<
  MentionEditorHandle,
  MentionEditorProps
>(function MentionEditor(
  {
    value,
    onChange,
    onSubmit,
    placeholder,
    disabled = false,
    configItems = [],
    searchFiles,
    displayLabels = {},
    ariaLabel,
  },
  ref,
) {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const [popup, setPopup] = React.useState<PopupState | null>(null);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [remoteFiles, setRemoteFiles] = React.useState<MentionResourceItem[]>(
    [],
  );
  // 上一次由本组件发出的值：用来区分「外部改了值」与「自己打字的回声」。
  // 初值是 null 而不是 value——否则首次挂载时两者相等，内容根本不会建出来。
  const emittedRef = React.useRef<string | null>(null);
  const searchIdRef = React.useRef(0);

  /** 把 DOM 内容换成 `next`，并把光标放到 `caret`。 */
  const renderValue = React.useCallback(
    (next: string, caret?: number) => {
      const editor = editorRef.current;
      if (!editor) return;

      editor.replaceChildren(buildEditorFragment(next, displayLabels));
      fillMentionIcons(editor);
      emittedRef.current = next;
      if (caret !== undefined) setSelectionRawOffset(editor, caret);
    },
    [displayLabels],
  );

  // 打字产生的芯片是 lib 层直接插进 DOM 的，图标占位也要在这里补上
  React.useEffect(() => {
    fillMentionIcons(editorRef.current);
  });

  // 外部值变化（切线程、草稿回填、发送后清空）时重建；打字产生的回声不动 DOM
  React.useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (value === emittedRef.current) return;
    if (serializeEditorContent(editor) === value) {
      emittedRef.current = value;
      return;
    }

    renderValue(value);
  }, [value, renderValue]);

  const groups: MentionGroups = React.useMemo(
    () => buildMentionGroups(popup?.query ?? '', configItems, remoteFiles),
    [popup?.query, configItems, remoteFiles],
  );
  const flat = React.useMemo(() => {
    const list: MentionResourceItem[] = [];
    for (const key of [
      'files',
      'knowledgeBases',
      'mcps',
      'skills',
      'subagents',
    ] as const) {
      list.push(...groups[key]);
    }

    return list;
  }, [groups]);

  /** 重新计算「光标前是不是在输入 @ 查询」，并顺带触发远程文件搜索。 */
  const refreshPopup = React.useCallback(() => {
    const editor = editorRef.current;
    if (!editor || disabled || !searchFiles) {
      setPopup(null);
      return;
    }

    const offset = getSelectionRawOffset(editor);
    const found =
      offset === null
        ? null
        : findActiveMentionQuery(serializeEditorContent(editor), offset);
    setPopup(found);
    setActiveIndex(0);

    const query = found?.query ?? '';
    const id = searchIdRef.current + 1;
    searchIdRef.current = id;
    if (!query.trim()) {
      setRemoteFiles([]);
      return;
    }

    window.setTimeout(() => {
      // 迟到的响应不能覆盖新查询的结果
      if (searchIdRef.current !== id) return;
      void searchFiles(query).then((files) => {
        if (searchIdRef.current === id) setRemoteFiles(files);
      });
    }, MENTION_SEARCH_DEBOUNCE_MS);
  }, [disabled, searchFiles]);

  const handleInput = () => {
    const editor = editorRef.current;
    if (!editor) return;

    const next = serializeEditorContent(editor);
    emittedRef.current = next;
    onChange(next);
    refreshPopup();
  };

  /** 插入候选项：把 `@查询` 换成令牌加一个空格，光标落在空格之后。 */
  const insertMention = (item: MentionResourceItem) => {
    const editor = editorRef.current;
    if (!editor || !popup) return;

    const current = serializeEditorContent(editor);
    const inserted = `${item.tokenLabel} `;
    const next = replaceRawRange(current, popup.start, popup.end, inserted);
    renderValue(next, popup.start + inserted.length);
    onChange(next);
    setPopup(null);
    editor.focus();
  };

  /**
   * 「+」面板选资源时插入令牌：没有 `@查询` 可替换，因此落在当前光标处。
   * 光标不在编辑器里（用户刚点了面板）时追加到末尾，而不是丢弃这次选择。
   */
  const insertMentionToken = React.useCallback(
    (item: MentionResourceItem) => {
      const editor = editorRef.current;
      if (!editor || disabled) return;

      const current = serializeEditorContent(editor);
      const offset = getSelectionRawOffset(editor);
      const at = offset === null ? current.length : offset;
      const inserted = `${item.tokenLabel} `;
      const next = replaceRawRange(current, at, at, inserted);

      renderValue(next, at + inserted.length);
      onChange(next);
      setPopup(null);
      editor.focus();
    },
    [disabled, onChange, renderValue],
  );

  React.useImperativeHandle(ref, () => ({ insertMentionToken }), [
    insertMentionToken,
  ]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;

    if (popup && flat.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((index) =>
          moveMentionSelection(
            index,
            event.key === 'ArrowDown' ? 1 : -1,
            flat.length,
          ),
        );
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const item = flat[activeIndex];
        if (item) insertMention(item);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setPopup(null);
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey && onSubmit) {
      event.preventDefault();
      onSubmit();
      return;
    }

    if (event.key !== 'Backspace' && event.key !== 'Delete') return;

    const editor = editorRef.current;
    if (!editor) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!range.collapsed) return;

    const offset = getSelectionRawOffset(editor);
    if (offset === null) return;

    const current = serializeEditorContent(editor);
    const expanded = expandMentionDeletionRange(
      current,
      offset,
      offset,
      event.key === 'Backspace' ? 'backward' : 'forward',
    );
    if (!expanded) return;

    event.preventDefault();
    const next = replaceRawRange(current, expanded.start, expanded.end, '');
    renderValue(next, expanded.start);
    emittedRef.current = next;
    onChange(next);
    setPopup(null);
  };

  return (
    <div className={styles.wrapper}>
      <div
        ref={editorRef}
        /* 提及要显示成整体芯片，原生 input/textarea 只能放纯文本，因此这里用
           contenteditable + role=textbox（ARIA 对富文本输入的标准做法） */
        /* eslint-disable-next-line jsx-a11y/prefer-tag-over-role */
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline
        tabIndex={disabled ? -1 : 0}
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        className={styles.editor}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onKeyUp={refreshPopup}
        onClick={refreshPopup}
        onBlur={() => setPopup(null)}
      />

      {popup && !isEmptyMentionGroups(groups) ? (
        <div className={styles.popupAnchor}>
          <MentionPopup
            groups={groups}
            activeIndex={activeIndex}
            query={popup.query}
            onSelect={insertMention}
            onHoverIndex={setActiveIndex}
          />
        </div>
      ) : null}
    </div>
  );
});
