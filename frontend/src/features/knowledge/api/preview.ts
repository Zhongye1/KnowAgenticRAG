import { useQuery } from '@tanstack/react-query';

import { getDocumentPreview } from '@/generated/documents/get-document-preview';
import { env } from '@/config/env';
import { getAccessToken } from '@/lib/api-client';
import type { PreviewItem } from '@/generated/types';

/**
 * 文档预览 API 层（kb 落地改造清单 Phase 3 / D55）。
 *
 * 两个关键点与后端设计对齐：
 *
 * 1. **PDF 不走预签名直连**（D55.1）：Range 代理端点每次请求都校验 ACL，而预签名 URL
 *    签发后即绕过授权。代价是字节过服务端——但 PDF.js 只取所需窗口、不拉全量。
 * 2. **Office 是异步转换**（D55.2）：首次访问返回 `converting`，前端退避轮询到
 *    `ready`；转换失败会降级为解析产物 Markdown（`degraded: true`）。
 */

export const PREVIEW_QUERY_KEY = ['documents', 'preview'] as const;

/** 转换中轮询退避：1s → 2s → 4s，封顶 5s。 */
const POLL_BACKOFF_MS = [1000, 2000, 4000, 5000];

/** Range 代理端点的绝对地址（PDF.js 自己要发请求，必须带鉴权头）。 */
export const previewContentUrl = (documentId: string) =>
  `${env.API_URL}/api/v1/documents/${documentId}/preview/content`;

/**
 * PDF.js 需要的鉴权头。
 *
 * PDF.js 用自己的 fetch，**不经过 axios 拦截器**，所以必须显式带上 token，
 * 否则 Range 端点会 401（后端 `DependsJwtAuth`）。同 `chat` 的 SSE 请求。
 */
export const previewAuthHeaders = (): Record<string, string> => {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

type UseDocumentPreviewOptions = {
  documentId: string;
  /** 文本/ Markdown 续读窗口的字节偏移 */
  offset?: number;
  enabled?: boolean;
};

export const useDocumentPreview = ({
  documentId,
  offset = 0,
  enabled = true,
}: UseDocumentPreviewOptions) => {
  return useQuery<PreviewItem>({
    queryKey: [...PREVIEW_QUERY_KEY, documentId, offset],
    queryFn: () => getDocumentPreview({ document_id: documentId, offset }),
    enabled: enabled && Boolean(documentId),
    // 转换中持续轮询；到 ready / failed 即停
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status !== 'converting') return false;
      const attempts = query.state.dataUpdateCount;
      return POLL_BACKOFF_MS[Math.min(attempts, POLL_BACKOFF_MS.length - 1)];
    },
    // 轮询期间不要因为 refetch 把界面打回 loading
    placeholderData: (previous) => previous,
  });
};
