import { useCallback, useMemo, useState } from 'react';

import type { PreviewItem } from '@/generated/types';
import { useDocumentPreview } from '../api/preview';

/**
 * 预览窗口累积（kb 落地改造清单 Phase 3 / D55 §3A）。
 *
 * 后端文本类预览按**字节窗口**返回（`content` + `next_offset`），不是一次给全文——
 * 一次拉全量对大文件不可接受。本 hook 把已取回的窗口按 offset 累积成连续文本，
 * 前端表现为「加载更多」而不是「翻页替换」（替换会让已读内容消失）。
 *
 * 两处状态调整放在 **render 期**而非 effect 里，这是 React 官方对「派生自 props 的
 * 状态调整」的推荐做法：放 effect 里会多一轮级联渲染（`react(set-state-in-effect)`）。
 * 重置与追加合并为**一次** setState，并用 `prev` 重算基准，避免两者竞态。
 */

type PreviewWindow = {
  offset: number;
  content: string;
};

type WindowState = {
  docId: string;
  offset: number;
  windows: PreviewWindow[];
};

const EMPTY_WINDOWS: PreviewWindow[] = [];

export const useDocumentPreviewWindow = (
  documentId: string,
  enabled = true,
) => {
  const [state, setState] = useState<WindowState>({
    docId: documentId,
    offset: 0,
    windows: EMPTY_WINDOWS,
  });

  const needsReset = state.docId !== documentId;
  const query = useDocumentPreview({
    documentId,
    // 换文档的同一轮渲染里游标必须归零，否则会拿新文档去请求旧 offset
    offset: needsReset ? 0 : state.offset,
    enabled,
  });

  const incoming = query.data;
  const incomingContent = incoming?.content ?? null;
  const incomingOffset =
    incomingContent === null ? null : (incoming?.offset ?? 0);

  if (needsReset || incomingOffset !== null) {
    setState((prev) => {
      const base: WindowState =
        prev.docId === documentId
          ? prev
          : { docId: documentId, offset: 0, windows: EMPTY_WINDOWS };
      if (incomingOffset === null || incomingContent === null) return base;
      // 同一窗口可能因 refetch / 重渲染重复到达，按 offset 去重（否则出现重复段落）
      if (base.windows.some((item) => item.offset === incomingOffset))
        return base;
      return {
        ...base,
        windows: [
          ...base.windows,
          { offset: incomingOffset, content: incomingContent },
        ],
      };
    });
  }

  const windows = needsReset ? EMPTY_WINDOWS : state.windows;

  const merged = useMemo<PreviewItem | undefined>(() => {
    if (!incoming) return undefined;
    if (incoming.kind !== 'markdown' && incoming.kind !== 'text')
      return incoming;
    const content = [...windows]
      .sort((a, b) => a.offset - b.offset)
      .map((item) => item.content)
      .join('');
    return { ...incoming, content };
  }, [incoming, windows]);

  const nextOffset = incoming?.next_offset;
  const loadMore = useCallback(() => {
    if (nextOffset != null)
      setState((prev) => ({ ...prev, offset: nextOffset }));
  }, [nextOffset]);

  return {
    preview: merged,
    /** 首次加载（还没有任何已合并内容）时才是骨架 */
    isLoading: query.isLoading,
    isFetchingMore: query.isFetching && windows.length > 0,
    /** 走了降级梯（Office 转换失败 → 解析产物 Markdown），由调用方提示用户 */
    isDegraded: Boolean(merged?.degraded),
    loadMore,
    hasMore: nextOffset != null,
  };
};
