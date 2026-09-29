import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { env } from '@/config/env';
import { useUser } from '@/lib/auth';
import { formatDate } from '@/utils/format';

import { NicknameDialog } from './nickname-dialog';

/**
 * 后端 `avatar` 存的是 `/static/upload/*` 这类**服务端相对路径**，直接塞给 <img>
 * 会被浏览器解析成前端自己的地址（dev 下是 5000 端口）而 404，故补上 API origin。
 */
const avatarSrc = (avatar: string | null | undefined) => {
  if (!avatar) return undefined;
  return avatar.startsWith('http') ? avatar : `${env.API_URL}${avatar}`;
};

const joinedAtText = (joinTime: string | null | undefined) => {
  if (!joinTime) return '-';
  const timestamp = new Date(joinTime).getTime();
  return Number.isNaN(timestamp) ? '-' : formatDate(timestamp);
};

const Entry = ({ label, value }: { label: string; value: string }) => (
  <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
    <dt className="text-sm font-medium text-color-text-3">{label}</dt>
    <dd className="mt-1 text-sm text-color-text-1 sm:col-span-2 sm:mt-0">
      {value}
    </dd>
  </div>
);

/**
 * 资料卡：会话用户（`GET /sys/users/me`）的只读展示 + 昵称入口。
 * 头像在本期只读——`PUT /me/avatar` 收的是 URL，而上传端点要求 `sys:file:upload`
 * 权限（当前没有任何角色被授予），先不做上传入口，避免摆一个必然 403 的按钮。
 */
export function ProfileCard() {
  const user = useUser();
  const data = user.data;

  if (!data) return null;

  const displayName = data.nickname || data.username;

  return (
    <section className="overflow-hidden rounded-large bg-color-bg-2 shadow-2-center">
      <header className="flex flex-wrap items-start justify-between gap-4 px-4 py-5 sm:px-6">
        <div className="flex items-center gap-4">
          <Avatar size="lg" className="size-14">
            <AvatarImage
              src={avatarSrc(data.avatar)}
              alt={displayName}
              className="size-14"
            />
            <AvatarFallback className="text-base">
              {displayName.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-medium leading-6 text-color-text-1">
                {displayName}
              </h3>
              <Badge variant="secondary">@{data.username}</Badge>
              {data.is_superuser ? <Badge>超级管理员</Badge> : null}
            </div>
            <p className="text-sm text-color-text-3">
              {data.email || '未绑定邮箱'}
            </p>
          </div>
        </div>
        <NicknameDialog />
      </header>
      <dl className="divide-y divide-color-border-2 border-t border-color-border-2 px-4 sm:px-6">
        <Entry label="用户名" value={data.username} />
        <Entry label="昵称" value={data.nickname || '-'} />
        <Entry label="邮箱" value={data.email || '未绑定'} />
        <Entry label="手机号" value={data.phone || '-'} />
        <Entry label="部门" value={data.dept || '-'} />
        <Entry label="角色" value={data.roles.join('、') || '-'} />
        <Entry label="加入时间" value={joinedAtText(data.join_time)} />
      </dl>
    </section>
  );
}
