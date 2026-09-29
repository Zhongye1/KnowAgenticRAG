import { useUser } from '@/lib/auth';

import { EmailDialog } from './email-dialog';
import { PasswordDialog } from './password-dialog';

const Row = ({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: React.ReactNode;
}) => (
  <div className="flex flex-wrap items-center justify-between gap-3 py-4">
    <div className="space-y-1">
      <p className="text-sm font-medium text-color-text-1">{title}</p>
      <p className="text-xs text-color-text-3">{description}</p>
    </div>
    {action}
  </div>
);

/** 账号安全：自助改密码与换邮箱。两项都在服务端二次校验（旧密码 / 邮箱验证码）。 */
export function SecurityCard() {
  const user = useUser();
  const email = user.data?.email || '未绑定';

  return (
    <section className="overflow-hidden rounded-large bg-color-bg-2 shadow-2-center">
      <header className="px-4 py-5 sm:px-6">
        <h3 className="text-lg font-medium leading-6 text-color-text-1">
          账号安全
        </h3>
        <p className="mt-1 max-w-2xl text-sm text-color-text-3">
          密码与邮箱属于登录凭据，改动都会立即影响当前会话。
        </p>
      </header>
      <div className="divide-y divide-color-border-2 border-t border-color-border-2 px-4 sm:px-6">
        <Row
          title="登录密码"
          description="修改成功后当前会话会退出，需要用新密码重新登录。"
          action={<PasswordDialog />}
        />
        <Row
          title="邮箱"
          description={`当前：${email}。更换后用于验证码与系统通知。`}
          action={<EmailDialog />}
        />
      </div>
    </section>
  );
}
