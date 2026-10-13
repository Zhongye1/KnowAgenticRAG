/**
 * 系统配置里对话页用到的两个值。
 *
 * 一条查询供多处消费：默认模型参与模型的四级回退，默认 OCR 引擎参与附件解析方式的默认值。
 * 读不到时各自返回空串，回退链与默认值继续往下走。
 */
import { useQuery } from '@tanstack/react-query';

import { getSystemConfig } from '../api/system-config-api';

export const systemConfigKeys = {
  all: ['chat', 'system-config'] as const,
};

const asText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/** 系统配置；管理面端点，失败不重试也不打扰用户。 */
export const useSystemConfig = () =>
  useQuery({
    queryKey: systemConfigKeys.all,
    queryFn: getSystemConfig,
    retry: false,
  });

/** 系统默认模型。 */
export const useSystemDefaultModel = (): string =>
  asText(useSystemConfig().data?.default_model);

/** 系统默认 OCR 引擎；附件解析方式默认值的第一优先级。 */
export const useDefaultOcrEngine = (): string =>
  asText(useSystemConfig().data?.default_ocr_engine);

/** 快速响应模型；会话标题自动生成走它，读不到时由调用方回退截断。 */
export const useFastModel = (): unknown => useSystemConfig().data?.fast_model;
