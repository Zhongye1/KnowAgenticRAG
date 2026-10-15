/**
 * 系统信息与进程健康查询。
 *
 * 品牌配置读取失败不阻塞页面：查询处于错误态时 `data` 为 undefined，
 * 由各页面的投影函数落到默认值。
 */
import { useQuery } from '@tanstack/react-query';

import { getSystemHealth, getSystemInfo } from '../api/system-info-api';
import {
  selectHomeBranding,
  selectLoginBranding,
  selectShellBranding,
  type HomeBranding,
  type LoginBranding,
  type ShellBranding,
} from '../lib/system-info';

/**
 * `enabled` 用于「先健康检查、通过后才加载配置」的页面：首页在健康结果出来前
 * 不发起配置请求，失败时也就不会加载配置。
 */
export const useSystemInfo = (options: { enabled?: boolean } = {}) => {
  return useQuery({
    queryKey: ['system-info'],
    queryFn: getSystemInfo,
    retry: false,
    staleTime: 5 * 60 * 1000,
    enabled: options.enabled ?? true,
  });
};

/** 登录页品牌投影：组织名、品牌名、Logo、背景与页脚协议地址。 */
export const useLoginBranding = (): LoginBranding => {
  return selectLoginBranding(useSystemInfo().data);
};

/** 首页顶栏投影：品牌名与 Logo。 */
export const useHomeBranding = (
  options: { enabled?: boolean } = {},
): HomeBranding => {
  return selectHomeBranding(useSystemInfo(options).data);
};

/** 导航列品牌投影：组织名（兜底品牌名）与组织头像。 */
export const useShellBranding = (): ShellBranding => {
  return selectShellBranding(useSystemInfo().data);
};

/** liveness 查询；`refetch` 就是告警条与错误态上的「重试」。 */
export const useSystemHealth = () => {
  return useQuery({
    queryKey: ['system-health'],
    queryFn: getSystemHealth,
    retry: false,
  });
};
