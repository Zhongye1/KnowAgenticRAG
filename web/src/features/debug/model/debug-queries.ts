/**
 * 调试弹窗的查询装配。
 *
 * 三份数据各自独立取：日志（可开 5 秒自动刷新）、系统配置、用户列表。都只在弹窗打开时启用，
 * 关掉即停止（自动刷新用函数式 `refetchInterval`，开关一变就生效）。
 */
import { useQuery } from '@tanstack/react-query';

import { debugApi } from '../api/debug-api';

/** 自动刷新间隔。 */
export const LOG_REFRESH_INTERVAL = 5000;

export const debugKeys = {
  all: ['debug'] as const,
  logs: (levels: string) => [...debugKeys.all, 'logs', levels] as const,
  config: () => [...debugKeys.all, 'config'] as const,
  users: () => [...debugKeys.all, 'users'] as const,
};

/** 系统日志；`autoRefresh` 为真时按 5 秒重取。 */
export const useSystemLogs = (
  levels: string,
  options: { enabled?: boolean; autoRefresh?: boolean } = {},
) =>
  useQuery({
    queryKey: debugKeys.logs(levels),
    queryFn: () => debugApi.getLogs(levels),
    enabled: options.enabled ?? true,
    refetchInterval: options.autoRefresh ? LOG_REFRESH_INTERVAL : false,
  });

export const useSystemConfig = (enabled: boolean) =>
  useQuery({
    queryKey: debugKeys.config(),
    queryFn: () => debugApi.getConfig(),
    enabled,
  });

export const useDebugUsers = (enabled: boolean) =>
  useQuery({
    queryKey: debugKeys.users(),
    queryFn: () => debugApi.listUsers(),
    enabled,
  });
