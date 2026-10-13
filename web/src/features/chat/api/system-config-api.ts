/**
 * 系统配置里对话页用到的值。
 *
 * 与模型列表分开请求：这个端点是管理面，普通用户可能读不到，失败时只表示「没有配置值」，
 * 不该把别的东西一起带失败。同一个查询被多处消费，因此只发一次请求。
 */
import { unwrap } from '@/shared/api';
import { getConfigApiSystemConfigGet } from '@/shared/api/generated/sdk.gen';

/** 原始配置；字段按不可信数据处理，取值由 `model/system-config.ts` 负责。 */
export async function getSystemConfig(): Promise<Record<string, unknown>> {
  const config = unwrap<unknown>(await getConfigApiSystemConfigGet());

  return typeof config === 'object' && config !== null && !Array.isArray(config)
    ? (config as Record<string, unknown>)
    : {};
}
