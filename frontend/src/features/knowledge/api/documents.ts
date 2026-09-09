import { keepPreviousData, useMutation, useQueryClient } from '@tanstack/react-query'

import { deleteDocument } from '@/generated/documents/delete-document'
import { getDocumentDownload } from '@/generated/documents/get-document-download'
import {
  getDocumentsQueryOptions,
  useGetDocuments,
} from '@/generated/documents/get-documents'
import { replaceDocumentFile } from '@/generated/documents/replace-document-file'
import { updateDocument } from '@/generated/documents/update-document'
import { uploadDocument } from '@/generated/documents/upload-document'
import { MutationConfig, QueryConfig } from '@/lib/react-query'

/**
 * 文档 API 层：请求路径、入参与出参类型均来自 OpenAPI 生成的 IDL
 * （src/generated/documents/*），此处只补充 React Query 侧的查询默认值
 * 与写操作后的缓存失效。
 */

export const DOCUMENTS_QUERY_KEY = ['documents'] as const
export const DOCUMENTS_PAGE_SIZE = 20

export type UseDocumentsParams = {
  query?: string | null
  sourceType?: string | null
  status?: string | null
  page?: number
  size?: number
}

export const useDocuments = (
  kbName: string | null,
  {
    params = {},
    queryConfig,
  }: {
    params?: UseDocumentsParams
    queryConfig?: QueryConfig<typeof getDocumentsQueryOptions>
  } = {},
) => {
  return useGetDocuments({
    params: {
      kb_name: kbName ?? undefined,
      query: params.query || undefined,
      source_type: params.sourceType || undefined,
      status: params.status || undefined,
      page: params.page ?? 1,
      size: params.size ?? DOCUMENTS_PAGE_SIZE,
    },
    queryConfig: {
      enabled: Boolean(kbName),
      placeholderData: keepPreviousData,
      ...queryConfig,
    },
  })
}

/** 上传单个文件到知识库（对接 OSS，登记为 pending）。 */
export const uploadDocumentFile = uploadDocument

/** 删除单篇文档（级联清理对象存储与登记）。 */
export const deleteDocumentById = deleteDocument

/** 获取预签名下载地址（普通异步调用，不走 React Query 缓存）。 */
export const getDocumentDownloadUrl = async (
  documentId: string,
): Promise<{ url: string }> => {
  const data = await getDocumentDownload({ document_id: documentId })
  return data as { url: string }
}

export type UploadDocumentInput = {
  kbName: string
  file: File
}

const uploadDocumentWithContext = ({ kbName, file }: UploadDocumentInput) =>
  uploadDocument({ file, kb_name: kbName, source_type: 'file' })

type UseUploadDocumentOptions = {
  mutationConfig?: MutationConfig<typeof uploadDocumentWithContext>
}

export const useUploadDocument = ({
  mutationConfig,
}: UseUploadDocumentOptions = {}) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...restConfig } = mutationConfig || {}

  return useMutation({
    mutationFn: uploadDocumentWithContext,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: ['knowledge_bases'] })
      onSuccess?.(...args)
    },
    ...restConfig,
  })
}

export type UpdateDocumentInput = {
  kbName: string
  documentId: string
  name?: string
}

const updateDocumentWithContext = ({ documentId, name }: UpdateDocumentInput) =>
  updateDocument({ document_id: documentId, data: { name } })

type UseUpdateDocumentOptions = {
  mutationConfig?: MutationConfig<typeof updateDocumentWithContext>
}

export const useUpdateDocument = ({
  mutationConfig,
}: UseUpdateDocumentOptions = {}) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...restConfig } = mutationConfig || {}

  return useMutation({
    mutationFn: updateDocumentWithContext,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: ['knowledge_bases'] })
      onSuccess?.(...args)
    },
    ...restConfig,
  })
}

export type DeleteDocumentInput = {
  kbName: string
  documentId: string
}

const deleteDocumentWithContext = ({ documentId }: DeleteDocumentInput) =>
  deleteDocument({ document_id: documentId })

type UseDeleteDocumentOptions = {
  mutationConfig?: MutationConfig<typeof deleteDocumentWithContext>
}

export const useDeleteDocument = ({
  mutationConfig,
}: UseDeleteDocumentOptions = {}) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...restConfig } = mutationConfig || {}

  return useMutation({
    mutationFn: deleteDocumentWithContext,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: ['knowledge_bases'] })
      onSuccess?.(...args)
    },
    ...restConfig,
  })
}

export type ReplaceDocumentFileInput = {
  kbName: string
  documentId: string
  file: File
}

const replaceDocumentFileWithContext = ({
  documentId,
  file,
}: ReplaceDocumentFileInput) =>
  replaceDocumentFile({ document_id: documentId, file })

type UseReplaceDocumentFileOptions = {
  mutationConfig?: MutationConfig<typeof replaceDocumentFileWithContext>
}

export const useReplaceDocumentFile = ({
  mutationConfig,
}: UseReplaceDocumentFileOptions = {}) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...restConfig } = mutationConfig || {}

  return useMutation({
    mutationFn: replaceDocumentFileWithContext,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: ['knowledge_bases'] })
      onSuccess?.(...args)
    },
    ...restConfig,
  })
}
