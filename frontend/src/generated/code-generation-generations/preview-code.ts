import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 代码生成预览 */
export type PreviewCodeParams = {
  pk: string | number;
};

export const previewCode = (params: PreviewCodeParams): Promise<Record<string, string>> => {
  const { pk } = params;
  return api.get(`/api/v1/code-generation/generations/${pk}/preview`).then((res) => res.data);
};

export const previewCodeQueryOptions = (params: PreviewCodeParams) => {
  return queryOptions({
    queryKey: ['code-generation-generations', 'preview-code', params],
    queryFn: () => previewCode(params),
  });
};

type UsePreviewCodeOptions = {
  params: PreviewCodeParams;
  queryConfig?: QueryConfig<typeof previewCodeQueryOptions>;
};

export const usePreviewCode = (options: UsePreviewCodeOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...previewCodeQueryOptions(params),
    ...queryConfig,
  });
};