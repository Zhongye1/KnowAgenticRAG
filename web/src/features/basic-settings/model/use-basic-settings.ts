/**
 * 基本设置面板的状态与动作。
 *
 * 配置值直接读 `useSystemConfig` 的缓存；每改一项就写一项（后端 `config/update` 是批量接口，
 * 单键走同一路径），成功后由写入层把响应回写缓存。标签取后端的 `_config_items`，缺失时用
 * 参照的文案兜底。
 */
import * as React from 'react';

import {
  useSystemConfig,
  useUpdateSystemConfig,
} from '@/entities/system-config';
import { describeFailure } from '@/shared/api';

export type BasicSettings = {
  isLoading: boolean;
  saving: boolean;
  /** 取布尔配置；缺失按 false。 */
  boolValue: (key: string) => boolean;
  /** 取字符串配置；缺失按空串。 */
  stringValue: (key: string) => string;
  /** 取配置项标签；后端没给时用兜底文案。 */
  labelOf: (key: string, fallback: string) => string;
  setValue: (key: string, value: unknown) => Promise<void>;
};

export const useBasicSettings = (options: {
  notifyError: (message: string) => void;
}): BasicSettings => {
  const { notifyError } = options;
  const { config, isLoading } = useSystemConfig();
  const updateConfig = useUpdateSystemConfig();
  const [saving, setSaving] = React.useState(false);

  const values = config?.values;

  const boolValue = React.useCallback(
    (key: string) => values?.[key] === true,
    [values],
  );

  const stringValue = React.useCallback(
    (key: string) => {
      const value = values?.[key];

      return typeof value === 'string' ? value : '';
    },
    [values],
  );

  const labelOf = React.useCallback(
    (key: string, fallback: string) => config?.items[key]?.label || fallback,
    [config],
  );

  const setValue = React.useCallback(
    async (key: string, value: unknown) => {
      setSaving(true);
      try {
        await updateConfig.mutateAsync({ [key]: value });
      } catch (failure) {
        notifyError(describeFailure(failure, '保存配置失败'));
      } finally {
        setSaving(false);
      }
    },
    [notifyError, updateConfig],
  );

  return { isLoading, saving, boolValue, stringValue, labelOf, setValue };
};
