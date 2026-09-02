import { useMutation, useQueryClient } from '@tanstack/react-query';

import { deleteDocument } from '@/generated/documents/delete-document';
import { getDocumentDownload } from '@/generated/documents/get-document-download';
import {
  getDocumentsQueryOptions,
  useGetDocuments,
} from '@/generated/documents/get-documents';
import { replaceDocumentFile } from '@/generated/documents/replace-document-file';
import { updateDocument } from '@/generated/documents/update-document';
import { uploadDocument } from '@/generated/documents/upload-document';
import { MutationConfig, QueryConfig } from '@/lib/react-query';

/**
 * 文档 API 层：请求路径、入参与出参类型均来自 OpenAPI 生成的 IDL
 * （src/generated/documents/*），此处只补充 React Query 侧的
 * 查询默认参数与写操作后的缓存失效。
 */

// 文档面板单页展示条数
const DOCUMENTS_PAGE_SIZE = 50;

export const useDocuments = (
  kbName: string | null,
  {
    queryConfig,
  }: {
    queryConfig?: QueryConfig<typeof getDocumentsQueryOptions>;
  } = {},
) => {
  return useGetDocuments({
    params: { kb_name: kbName ?? undefined, size: DOCUMENTS_PAGE_SIZE },
    queryConfig: {
      enabled: Boolean(kbName),
      ...queryConfig,
    },
  });
};

export type UploadDocumentInput = {
  kbName: string;
  file: File;
};

const uploadDocumentWithContext = ({ kbName, file }: UploadDocumentInput) =>
  uploadDocument({ file, kb_name: kbName, source_type: 'file' });

type UseUploadDocumentOptions = {
  mutationConfig?: MutationConfig<typeof uploadDocumentWithContext>;
};

export const useUploadDocument = ({
  mutationConfig,
}: UseUploadDocumentOptions = {}) => {
  const queryClient = useQueryClient();
  const { onSuccess, ...restConfig } = mutationConfig || {};

  return useMutation({
    mutationFn: uploadDocumentWithContext,
    onSuccess: (...args) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge_bases'] });
      onSuccess?.(...args);
    },
    ...restConfig,
  });
};

export type UpdateDocumentInput = {
  kbName: string;
  documentId: string;
  name?: string;
};

const updateDocumentWithContext = ({ documentId, name }: UpdateDocumentInput) =>
  updateDocument({ document_id: documentId, data: { name } });

type UseUpdateDocumentOptions = {
  mutationConfig?: MutationConfig<typeof updateDocumentWithContext>;
};

export const useUpdateDocument = ({
  mutationConfig,
}: UseUpdateDocumentOptions = {}) => {
  const queryClient = useQueryClient();
  const { onSuccess, ...restConfig } = mutationConfig || {};

  return useMutation({
    mutationFn: updateDocumentWithContext,
    onSuccess: (...args) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge_bases'] });
      onSuccess?.(...args);
    },
    ...restConfig,
  });
};

export type DeleteDocumentInput = {
  kbName: string;
  documentId: string;
};

const deleteDocumentWithContext = ({ documentId }: DeleteDocumentInput) =>
  deleteDocument({ document_id: documentId });

type UseDeleteDocumentOptions = {
  mutationConfig?: MutationConfig<typeof deleteDocumentWithContext>;
};

export const useDeleteDocument = ({
  mutationConfig,
}: UseDeleteDocumentOptions = {}) => {
  const queryClient = useQueryClient();
  const { onSuccess, ...restConfig } = mutationConfig || {};

  return useMutation({
    mutationFn: deleteDocumentWithContext,
    onSuccess: (...args) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge_bases'] });
      onSuccess?.(...args);
    },
    ...restConfig,
  });
};

export type ReplaceDocumentFileInput = {
  kbName: string;
  documentId: string;
  file: File;
};

const replaceDocumentFileWithContext = ({
  documentId,
  file,
}: ReplaceDocumentFileInput) =>
  replaceDocumentFile({ document_id: documentId, file });

type UseReplaceDocumentFileOptions = {
  mutationConfig?: MutationConfig<typeof replaceDocumentFileWithContext>;
};

export const useReplaceDocumentFile = ({
  mutationConfig,
}: UseReplaceDocumentFileOptions = {}) => {
  const queryClient = useQueryClient();
  const { onSuccess, ...restConfig } = mutationConfig || {};

  return useMutation({
    mutationFn: replaceDocumentFileWithContext,
    onSuccess: (...args) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge_bases'] });
      onSuccess?.(...args);
    },
    ...restConfig,
  });
};

/** 获取预签名下载地址（普通异步调用，不走 React Query 缓存）。 */
export const getDocumentDownloadUrl = async (
  documentId: string,
): Promise<{ url: string }> => {
  const data = await getDocumentDownload({ document_id: documentId });
  return data as { url: string };
};
