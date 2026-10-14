/**
 * 用户 API Key 的查询与写入层。
 *
 * query key 的唯一事实在这里：列表只有一份（当前用户自己的 key）；三个写入统一失效它。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';

import {
  createApiKey,
  deleteApiKey,
  listApiKeys,
  updateApiKey,
} from '../api/user-apikeys-api';
import type {
  ApiKeyCreated,
  ApiKeyItem,
  ApiKeyUpdate,
} from '../api/user-apikeys-api';

/** 列表查询的 key；写入后按它失效。 */
export const API_KEYS_QUERY_KEY = ['user-apikeys'] as const;

export const useApiKeys = (): {
  keys: ApiKeyItem[];
  isLoading: boolean;
  refetch: () => void;
} => {
  const query = useQuery({
    queryKey: API_KEYS_QUERY_KEY,
    queryFn: listApiKeys,
  });

  return {
    keys: query.data ?? [],
    isLoading: query.isPending,
    refetch: () => void query.refetch(),
  };
};

const useInvalidateKeys = (): (() => void) => {
  const client = useQueryClient();

  return () => {
    void client.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY });
  };
};

/** 创建 API Key；解析值含一次性完整密钥。 */
export const useCreateApiKey = (): UseMutationResult<
  ApiKeyCreated,
  Error,
  { requestId: string; name: string; expiresAt?: string }
> => {
  const invalidate = useInvalidateKeys();

  return useMutation({
    mutationFn: createApiKey,
    onSuccess: invalidate,
  });
};

/** 启停一个 API Key。 */
export const useUpdateApiKey = (): UseMutationResult<
  void,
  Error,
  { id: number; input: ApiKeyUpdate }
> => {
  const invalidate = useInvalidateKeys();

  return useMutation({
    mutationFn: ({ id, input }) => updateApiKey(id, input),
    onSuccess: invalidate,
  });
};

/** 删除一个 API Key。 */
export const useDeleteApiKey = (): UseMutationResult<void, Error, number> => {
  const invalidate = useInvalidateKeys();

  return useMutation({
    mutationFn: deleteApiKey,
    onSuccess: invalidate,
  });
};
