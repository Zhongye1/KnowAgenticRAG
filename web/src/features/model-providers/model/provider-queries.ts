/**
 * 模型供应商面板的查询装配。
 *
 * 列表与默认模型各自一份查询；写操作成功后失效列表（默认模型不会因供应商改动而变，
 * 但停用/删除会改模型缓存，其他切片消费的 `/models/v2` 靠各自的 60 秒 staleTime 收敛）。
 * 远端模型拉取与连通性检查是按钮触发的一次性动作，用 mutation 表达。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  modelProviderApi,
  type ProviderPayload,
} from '../api/model-provider-api';

export const providerKeys = {
  all: ['model-providers'] as const,
  list: () => [...providerKeys.all, 'list'] as const,
  defaultModel: () => [...providerKeys.all, 'default-model'] as const,
};

/** 供应商配置列表。 */
export const useModelProviders = () =>
  useQuery({
    queryKey: providerKeys.list(),
    queryFn: () => modelProviderApi.listProviders(),
  });

/** 当前默认模型 spec；供「删除/停用正在使用的供应商」判定。 */
export const useDefaultModelSpec = () =>
  useQuery({
    queryKey: providerKeys.defaultModel(),
    queryFn: () => modelProviderApi.getDefaultModelSpec(),
  });

const useInvalidateProviders = () => {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: providerKeys.list() });
  };
};

/** 新建供应商。 */
export const useCreateProvider = () => {
  const invalidate = useInvalidateProviders();
  return useMutation({
    mutationFn: (payload: ProviderPayload) =>
      modelProviderApi.createProvider(payload),
    onSuccess: invalidate,
  });
};

/** 保存供应商（含启停、模型清单）。 */
export const useUpdateProvider = () => {
  const invalidate = useInvalidateProviders();
  return useMutation({
    mutationFn: (variables: { providerId: string; payload: ProviderPayload }) =>
      modelProviderApi.updateProvider(variables.providerId, variables.payload),
    onSuccess: invalidate,
  });
};

/** 删除供应商。 */
export const useDeleteProvider = () => {
  const invalidate = useInvalidateProviders();
  return useMutation({
    mutationFn: (providerId: string) =>
      modelProviderApi.deleteProvider(providerId),
    onSuccess: invalidate,
  });
};

/** 拉取某个供应商的远端模型清单（不落库）。 */
export const useFetchRemoteModels = () =>
  useMutation({
    mutationFn: (providerId: string) =>
      modelProviderApi.fetchRemoteModels(providerId),
  });

/** 连通性检查；`spec` 形如 `provider_id:model_id`。 */
export const useTestModelStatus = () =>
  useMutation({
    mutationFn: (spec: string) => modelProviderApi.testModelStatus(spec),
  });
