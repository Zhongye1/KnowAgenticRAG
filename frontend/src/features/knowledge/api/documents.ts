import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig, QueryConfig } from '@/lib/react-query';

import { DocumentItem, PageResult } from './types';

export const getDocuments = (
  kbName: string,
): Promise<{ data: PageResult<DocumentItem> }> => {
  return api.get('/documents', {
    params: { kb_name: kbName, size: 50 },
  });
};

export const getDocumentsQueryOptions = (kbName: string) => {
  return queryOptions({
    queryKey: ['documents', kbName],
    queryFn: () => getDocuments(kbName),
    enabled: Boolean(kbName),
  });
};

type UseDocumentsOptions = {
  queryConfig?: QueryConfig<typeof getDocumentsQueryOptions>;
};

export const useDocuments = (
  kbName: string,
  { queryConfig }: UseDocumentsOptions = {},
) => {
  return useQuery({
    ...getDocumentsQueryOptions(kbName),
    ...queryConfig,
  });
};

export type UploadDocumentInput = {
  kbName: string;
  file: File;
  sourceType?: string;
};

export const uploadDocument = ({
  kbName,
  file,
  sourceType = 'file',
}: UploadDocumentInput): Promise<{ data: DocumentItem }> => {
  const formData = new FormData();
  formData.append('kb_name', kbName);
  formData.append('source_type', sourceType);
  formData.append('file', file);
  return api.post('/documents', formData);
};

type UseUploadDocumentOptions = {
  mutationConfig?: MutationConfig<typeof uploadDocument>;
};

export const useUploadDocument = ({
  mutationConfig,
}: UseUploadDocumentOptions = {}) => {
  const queryClient = useQueryClient();
  const { onSuccess, ...restConfig } = mutationConfig || {};

  return useMutation({
    onSuccess: (...args) => {
      const variables = args[1] as UploadDocumentInput;
      queryClient.invalidateQueries({
        queryKey: ['documents', variables.kbName],
      });
      queryClient.invalidateQueries({
        queryKey: ['knowledge-bases'],
      });
      onSuccess?.(...args);
    },
    ...restConfig,
    mutationFn: uploadDocument,
  });
};

export const getDocumentDownloadUrl = (
  documentId: string,
): Promise<{ data: { url: string } }> => {
  return api.get(`/documents/${documentId}/download`);
};

export type UpdateDocumentInput = {
  kbName: string;
  documentId: string;
  name?: string;
  source_type?: string;
  pipeline?: string;
  status?: string;
};

export const updateDocument = ({
  documentId,
  ...payload
}: UpdateDocumentInput): Promise<{ data: DocumentItem }> => {
  return api.patch(`/documents/${documentId}`, payload);
};

type UseUpdateDocumentOptions = {
  mutationConfig?: MutationConfig<typeof updateDocument>;
};

export const useUpdateDocument = ({
  mutationConfig,
}: UseUpdateDocumentOptions = {}) => {
  const queryClient = useQueryClient();
  const { onSuccess, ...restConfig } = mutationConfig || {};

  return useMutation({
    onSuccess: (...args) => {
      const variables = args[1] as UpdateDocumentInput;
      queryClient.invalidateQueries({
        queryKey: ['documents', variables.kbName],
      });
      onSuccess?.(...args);
    },
    ...restConfig,
    mutationFn: updateDocument,
  });
};

export type DeleteDocumentInput = {
  kbName: string;
  documentId: string;
};

export const deleteDocument = ({
  documentId,
}: DeleteDocumentInput): Promise<{ data: Record<string, number> }> => {
  return api.delete(`/documents/${documentId}`);
};

type UseDeleteDocumentOptions = {
  mutationConfig?: MutationConfig<typeof deleteDocument>;
};

export const useDeleteDocument = ({
  mutationConfig,
}: UseDeleteDocumentOptions = {}) => {
  const queryClient = useQueryClient();
  const { onSuccess, ...restConfig } = mutationConfig || {};

  return useMutation({
    onSuccess: (...args) => {
      const variables = args[1] as DeleteDocumentInput;
      queryClient.invalidateQueries({
        queryKey: ['documents', variables.kbName],
      });
      queryClient.invalidateQueries({
        queryKey: ['knowledge-bases'],
      });
      onSuccess?.(...args);
    },
    ...restConfig,
    mutationFn: deleteDocument,
  });
};

export type ReplaceDocumentFileInput = {
  kbName: string;
  documentId: string;
  file: File;
};

export const replaceDocumentFile = ({
  documentId,
  file,
}: ReplaceDocumentFileInput): Promise<{ data: DocumentItem }> => {
  const formData = new FormData();
  formData.append('file', file);
  return api.put(`/documents/${documentId}/file`, formData);
};

type UseReplaceDocumentFileOptions = {
  mutationConfig?: MutationConfig<typeof replaceDocumentFile>;
};

export const useReplaceDocumentFile = ({
  mutationConfig,
}: UseReplaceDocumentFileOptions = {}) => {
  const queryClient = useQueryClient();
  const { onSuccess, ...restConfig } = mutationConfig || {};

  return useMutation({
    onSuccess: (...args) => {
      const variables = args[1] as ReplaceDocumentFileInput;
      queryClient.invalidateQueries({
        queryKey: ['documents', variables.kbName],
      });
      queryClient.invalidateQueries({
        queryKey: ['knowledge-bases'],
      });
      onSuccess?.(...args);
    },
    ...restConfig,
    mutationFn: replaceDocumentFile,
  });
};
