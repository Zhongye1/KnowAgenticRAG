import { ShieldAlert } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';

import { ContentLayout } from '@/components/layouts';
import { Spinner } from '@/components/ui/spinner';
import { paths } from '@/config/paths';
import { useIsSuperuser, useUser } from '@/lib/auth';
import { cn } from '@/lib/utils';

/**
 * 管理面板外壳（kb / 组织 / 用户 的授权管理）。
 *
 * **准入 = `is_superuser`**，但这里只是体验级约束：真正的边界是后端每个路由上的
 * `Depends(RequestPermission(...)) + DependsRBAC`，以及 repository 的可见性查询。
 * 前端守卫的价值是别把无权入口摆给用户看，不是替代后端校验。
 */

const TABS = [
  { title: '用户', href: paths.app.admin.users.getHref() },
  { title: '部门', href: paths.app.admin.depts.getHref() },
  { title: '角色', href: paths.app.admin.roles.getHref() },
  { title: '知识库授权', href: paths.app.admin.kbAcl.getHref() },
];

const AdminRoot = () => {
  const user = useUser();
  const isSuperuser = useIsSuperuser();

  if (user.isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (!isSuperuser) {
    return (
      <ContentLayout title="管理面板">
        <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
          <ShieldAlert className="size-6 opacity-70" />
          <p className="text-sm">需要超级管理员权限</p>
          <p className="text-[11px] opacity-80">
            当前账户（{user.data?.username ?? '未知'}）不属于超级管理员
          </p>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="管理面板">
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <nav className="flex flex-wrap items-center gap-1 border-b border-color-border-2 pb-2">
          {TABS.map((tab) => (
            <NavLink
              key={tab.href}
              to={tab.href}
              className={({ isActive }) =>
                cn(
                  'rounded-medium px-3 py-1.5 text-xs transition-colors',
                  isActive
                    ? 'bg-color-bg-2 text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              {tab.title}
            </NavLink>
          ))}
        </nav>
        <div className="min-h-0 flex-1">
          <Outlet />
        </div>
      </div>
    </ContentLayout>
  );
};

export default AdminRoot;
