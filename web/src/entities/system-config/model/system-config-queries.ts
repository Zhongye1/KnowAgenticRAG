/**
 * 系统配置与 OCR 的查询与写入层。
 *
 * 四个 query key 的唯一事实在这里：系统配置（基本设置与 OCR 默认引擎共读）、通用配置项
 * （四组 OCR 服务凭据）、OCR 引擎清单、OCR 健康结论。写入成功后回写缓存。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';

import {
  getOcrHealth,
  getSystemConfig,
  listConfigOptions,
  listOcrEngines,
  updateConfigOption,
  updateSystemConfig,
} from '../api/system-config-api';
import type {
  ConfigOption,
  OcrEngine,
  OcrHealth,
  SystemConfig,
} from '../api/system-config-api';

export const SYSTEM_CONFIG_QUERY_KEY = ['system-config'] as const;
export const CONFIG_OPTIONS_QUERY_KEY = ['config-options'] as const;
export const OCR_ENGINES_QUERY_KEY = ['ocr-engines'] as const;
export const OCR_HEALTH_QUERY_KEY = ['ocr-health'] as const;

export const useSystemConfig = (
  enabled = true,
): {
  config: SystemConfig | undefined;
  isLoading: boolean;
  refetch: () => void;
} => {
  const query = useQuery({
    queryKey: SYSTEM_CONFIG_QUERY_KEY,
    queryFn: getSystemConfig,
    enabled,
  });

  return {
    config: query.data,
    isLoading: query.isPending,
    refetch: () => void query.refetch(),
  };
};

/** 批量写配置；响应即写入后的完整配置，直接回写缓存。 */
export const useUpdateSystemConfig = (): UseMutationResult<
  SystemConfig,
  Error,
  Record<string, unknown>
> => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: updateSystemConfig,
    onSuccess: (saved) => {
      client.setQueryData(SYSTEM_CONFIG_QUERY_KEY, saved);
    },
  });
};

export const useConfigOptions = (
  enabled = true,
): {
  options: ConfigOption[];
  isLoading: boolean;
  refetch: () => void;
} => {
  const query = useQuery({
    queryKey: CONFIG_OPTIONS_QUERY_KEY,
    queryFn: listConfigOptions,
    enabled,
  });

  return {
    options: query.data ?? [],
    isLoading: query.isPending,
    refetch: () => void query.refetch(),
  };
};

/** 保存一个通用配置项；成功后把列表缓存里的那一项换成响应值。 */
export const useUpdateConfigOption = (): UseMutationResult<
  ConfigOption | null,
  Error,
  { key: string; value: Record<string, unknown> }
> => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ key, value }) => updateConfigOption(key, value),
    onSuccess: (saved) => {
      if (!saved) return;
      client.setQueryData<ConfigOption[]>(CONFIG_OPTIONS_QUERY_KEY, (current) =>
        (current ?? []).map((option) =>
          option.key === saved.key ? saved : option,
        ),
      );
    },
  });
};

export const useOcrEngines = (
  enabled = true,
): {
  engines: OcrEngine[];
  isLoading: boolean;
} => {
  const query = useQuery({
    queryKey: OCR_ENGINES_QUERY_KEY,
    queryFn: listOcrEngines,
    enabled,
  });

  return {
    engines: query.data ?? [],
    isLoading: query.isPending,
  };
};

export const useOcrHealth = (
  enabled = true,
): {
  health: OcrHealth;
  /** 是否正在探服务；未启用时恒为 false（`isPending` 在禁用状态下也是 true，不能用它）。 */
  isLoading: boolean;
  refetch: () => void;
} => {
  const query = useQuery({
    queryKey: OCR_HEALTH_QUERY_KEY,
    queryFn: getOcrHealth,
    enabled,
  });

  return {
    health: query.data ?? {},
    isLoading: query.isFetching,
    refetch: () => void query.refetch(),
  };
};
