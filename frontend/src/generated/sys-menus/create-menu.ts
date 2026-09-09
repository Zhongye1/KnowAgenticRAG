import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { CreateMenuParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 创建菜单 */

export const createMenu = (data: CreateMenuParam): Promise<unknown> => {
  return api.post(`/api/v1/sys/menus`, data).then((res) => res.data);
};

type UseCreateMenuOptions = {
  mutationConfig?: MutationConfig<typeof createMenu>;
};

export const useCreateMenu = ({ mutationConfig }: UseCreateMenuOptions = {}) => {
  return useMutation({
    mutationFn: createMenu,
    ...mutationConfig,
  });
};