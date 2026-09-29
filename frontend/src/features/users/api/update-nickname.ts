import { useMutation } from '@tanstack/react-query';

import { updateUserNickname } from '@/generated/sys-users/update-user-nickname';
import { useUser } from '@/lib/auth';
import { MutationConfig } from '@/lib/react-query';

/**
 * 个人空间 API 层：generated 只给裸请求，这里补「改完刷新会话用户」。
 *
 * 会话用户由 `lib/auth.tsx` 的 react-query-auth 查询持有，昵称会同时出现在侧边栏与
 * 本页资料卡上，成功后 refetch 一次即可让两处同步；不额外 invalidate，
 * 因为 `['authenticated-user']` 就是这个查询的键。
 */
export const useUpdateNickname = ({
  mutationConfig,
}: {
  mutationConfig?: MutationConfig<typeof updateUserNickname>;
} = {}) => {
  const { refetch } = useUser();
  const { onSuccess, ...restConfig } = mutationConfig ?? {};

  return useMutation({
    onSuccess: (...args) => {
      refetch();
      onSuccess?.(...args);
    },
    ...restConfig,
    mutationFn: updateUserNickname,
  });
};
