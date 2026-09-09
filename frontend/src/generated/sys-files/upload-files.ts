import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { UploadUrl } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 本地文件上传 */
export type UploadFilesParams = {
  file: File;
};

export const uploadFiles = (params: UploadFilesParams): Promise<UploadUrl> => {
  const { file } = params;
  const formData = new FormData();
  formData.append('file', file);
  return api.post(`/api/v1/sys/files/upload`, formData).then((res) => res.data);
};

type UseUploadFilesOptions = {
  mutationConfig?: MutationConfig<typeof uploadFiles>;
};

export const useUploadFiles = ({ mutationConfig }: UseUploadFilesOptions = {}) => {
  return useMutation({
    mutationFn: uploadFiles,
    ...mutationConfig,
  });
};