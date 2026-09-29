import { Navigate } from 'react-router';

import { paths } from '@/config/paths';

/**
 * 旧的「个人信息」只读页已并入个人空间（`/app/space`）。
 * 保留该路由做重定向，避免既有链接 404——与 `/app/users → /app/admin/users` 同一处理方式。
 */
export default function ProfileRoute() {
  return <Navigate to={paths.app.space.getHref()} replace />;
}
