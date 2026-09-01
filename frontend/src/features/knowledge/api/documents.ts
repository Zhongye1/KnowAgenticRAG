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
