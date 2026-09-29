import { ContentLayout } from '@/components/layouts';
import { Spinner } from '@/components/ui/spinner';
import { useUser } from '@/lib/auth';

import { ProfileCard } from './profile-card';
import { SecurityCard } from './security-card';

/**
 * 个人空间（`/app/space`）：账号自助中心。
 *
 * 数据源就是会话用户那一个查询（`lib/auth.tsx` 的 react-query-auth），
 * 所以写操作成功后 refetch 它即可，本页不再另开查询。
 */
export function SpacePage() {
  const user = useUser();

  return (
    <ContentLayout title="个人空间">
      <div className="flex flex-col gap-6 pb-6">
        {user.isLoading ? (
          <div className="flex h-48 w-full items-center justify-center">
            <Spinner className="size-8" />
          </div>
        ) : user.data ? (
          <>
            <ProfileCard />
            <SecurityCard />
          </>
        ) : (
          <p className="py-10 text-sm text-color-text-3">
            无法读取当前账号信息，请重新登录后再试。
          </p>
        )}
      </div>
    </ContentLayout>
  );
}
