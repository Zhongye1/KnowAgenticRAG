import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { ProviderConnectivityParam, ProviderConnectivityResult } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 模型连通性测试 */

export const testConnection = (data: ProviderConnectivityParam): Promise<ProviderConnectivityResult> => {
  return api.post(`/api/v1/system/model-providers/test-connection`, data).then((res) => res.data);
};

type UseTestConnectionOptions = {
  mutationConfig?: MutationConfig<typeof testConnection>;
};

export const useTestConnection = ({ mutationConfig }: UseTestConnectionOptions = {}) => {
  return useMutation({
    mutationFn: testConnection,
    ...mutationConfig,
  });
};