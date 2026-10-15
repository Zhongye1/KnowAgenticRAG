/**
 * 运行时能力投影。
 *
 * LITE 模式下知识库、图谱与评估路由不会注册，前端据此隐藏入口。
 * 判定来源是后端 discovery 接口的能力声明：接口不存在属于配置结果，
 * 不能拿 404 或请求失败当成能力信号。
 */
import { useQuery } from '@tanstack/react-query';

import { getDiscovery } from '../api/session-api';

export const useCapabilities = () => {
  return useQuery({
    queryKey: ['runtime-capabilities'],
    queryFn: getDiscovery,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
};

/**
 * 知识域是否可用。返回 `undefined` 表示尚未取到投影，
 * 调用方据此区分「未知」与「明确关闭」，避免首屏闪烁或误判。
 */
export const useKnowledgeEnabled = (): boolean | undefined => {
  const capabilities = useCapabilities();
  return capabilities.data?.capabilities.features.knowledge;
};
