/**
 * 路由守卫：都是体验级约束，后端权限与能力门控才是最终边界。
 */
import { Navigate, Outlet } from 'react-router';

import { useCapabilities, useIsSuperuser } from '@/entities/session';
import { paths } from '@/shared/config';
import { Spinner } from '@/shared/ui/spinner';

/** 超管专属区域的体验级守卫；后端权限才是授权边界。 */
export const RequireSuperuser = () => {
  const isSuperuser = useIsSuperuser();
  return isSuperuser ? (
    <Outlet />
  ) : (
    <Navigate to={paths.app.chat.getHref()} replace />
  );
};

/**
 * 知识域能力守卫。
 *
 * LITE 模式下后端不注册知识库路由，深链直达时不能让页面停在请求失败态，
 * 所以只按 discovery 声明的能力重定向。投影请求失败或未识别属于服务故障，
 * 不当作「能力关闭」信号，此时仍渲染页面让故障显式暴露；投影未取到时先等待。
 */
export const RequireKnowledgeEnabled = () => {
  const capabilities = useCapabilities();

  if (capabilities.isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Spinner size="lg" />
      </div>
    );
  }

  const knowledgeEnabled = capabilities.data?.capabilities.features.knowledge;
  return knowledgeEnabled === false ? (
    <Navigate to={paths.app.chat.getHref()} replace />
  ) : (
    <Outlet />
  );
};
