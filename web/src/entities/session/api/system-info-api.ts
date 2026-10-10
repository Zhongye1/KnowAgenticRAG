/**
 * 系统信息与进程健康接口。
 *
 * 两个端点都是公开接口：信息配置提供组织、品牌与页脚事实，健康检查只表达
 * API 进程 liveness，不代表依赖就绪。请求路径由契约生成物拥有。
 */
import { unwrap } from '@/shared/api';
import {
  getInfoConfigApiSystemInfoGet,
  healthCheckApiSystemHealthGet,
} from '@/shared/api/generated/sdk.gen';

import type { SystemInfoData } from '../lib/system-info';

export type SystemHealth = {
  status: string;
  message?: string;
  version?: string;
};

/** 信息配置读取失败不抛给界面：品牌信息缺失时登录页用默认值继续。 */
export async function getSystemInfo(): Promise<SystemInfoData> {
  const payload = unwrap<{ data?: SystemInfoData }>(
    await getInfoConfigApiSystemInfoGet(),
  );
  return payload.data ?? {};
}

export async function getSystemHealth(): Promise<SystemHealth> {
  return unwrap<SystemHealth>(await healthCheckApiSystemHealthGet());
}
