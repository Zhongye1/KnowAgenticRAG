/**
 * 系统信息与进程健康查询。
 *
 * 品牌配置读取失败不阻塞登录页：查询处于错误态时 `data` 为 undefined，
 * 由 `selectLoginBranding` 落到默认值。
 */
import { useQuery } from '@tanstack/react-query';

import { getSystemHealth, getSystemInfo } from '../api/system-info-api';
import { selectLoginBranding, type LoginBranding } from '../lib/system-info';

export const useSystemInfo = () => {
  return useQuery({
    queryKey: ['system-info'],
    queryFn: getSystemInfo,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
};

/** 登录页品牌投影：组织名、品牌名、Logo、背景与页脚协议地址。 */
export const useLoginBranding = (): LoginBranding => {
  return selectLoginBranding(useSystemInfo().data);
};

/** liveness 查询；`refetch` 就是告警条上的「重试」。 */
export const useSystemHealth = () => {
  return useQuery({
    queryKey: ['system-health'],
    queryFn: getSystemHealth,
    retry: false,
  });
};
