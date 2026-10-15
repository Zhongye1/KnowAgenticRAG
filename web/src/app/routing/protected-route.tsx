/**
 * 登录守卫：未认证时把用户送回登录页，并带上原始路径。
 *
 * 这是体验级约束，后端在依赖与 repository 处执行最终授权。
 */
import { Navigate, Outlet, useLocation } from 'react-router';

import { useUnauthorizedReset, useUser } from '@/entities/session';
import { paths } from '@/shared/config';
import { Spinner } from '@/shared/ui/spinner';

export const ProtectedRoute = () => {
  const user = useUser();
  const location = useLocation();
  useUnauthorizedReset();

  if (user.isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  if (!user.data) {
    return (
      <Navigate to={paths.auth.login.getHref(location.pathname)} replace />
    );
  }

  return <Outlet />;
};
