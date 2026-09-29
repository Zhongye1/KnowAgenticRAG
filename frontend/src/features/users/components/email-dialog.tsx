import { Mail } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Form, Input } from '@/components/ui/form';
import { useNotifications } from '@/components/ui/notifications';
import { getApiErrorMessage } from '@/lib/api-error';
import { useUser } from '@/lib/auth';

import { useRequestEmailCaptcha } from '../api/request-email-captcha';
import { useUpdateEmail } from '../api/update-email';
import { useCountdown } from '../hooks/use-countdown';

const emailSchema = z.object({
  email: z.string().trim().min(1, '请输入邮箱').email('邮箱格式不正确'),
  captcha: z.string().trim().min(1, '请输入验证码'),
});

/**
 * 换绑邮箱：两步走。
 *
 * ① `POST /emails/captcha` 把验证码发到**新邮箱**（依赖后端 SMTP 配置，发不出去就直接报错）；
 * ② `PUT /sys/users/me/email` 带码提交，后端按请求 IP 校验码，因此两步要连着做完。
 */
export function EmailDialog() {
  const [open, setOpen] = useState(false);
  const user = useUser();
  const { addNotification } = useNotifications();
  const { seconds, running, start } = useCountdown();

  const requestMutation = useRequestEmailCaptcha({
    mutationConfig: {
      onSuccess: (_data, variables) => {
        start(60);
        addNotification({
          type: 'success',
          title: '验证码已发送',
          message: `请查收 ${variables.recipients}，验证码短时有效，过期可重发。`,
        });
      },
      onError: (error) => {
        addNotification({
          type: 'error',
          title: '验证码发送失败',
          message: getApiErrorMessage(error),
        });
      },
    },
  });

  const updateMutation = useUpdateEmail({
    mutationConfig: {
      onSuccess: () => {
        setOpen(false);
        addNotification({ type: 'success', title: '邮箱已更新' });
      },
      onError: (error) => {
        addNotification({
          type: 'error',
          title: '邮箱更新失败',
          message: getApiErrorMessage(error),
        });
      },
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          icon={<Mail className="size-3.5" />}
        >
          更换邮箱
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>更换邮箱</DialogTitle>
          <DialogDescription className="text-xs">
            当前邮箱：{user.data?.email || '未绑定'}。新邮箱会收到验证码，
            验证通过后立即生效。
          </DialogDescription>
        </DialogHeader>
        <Form
          id="email-form"
          onSubmit={(values) =>
            updateMutation.mutate({
              email: values.email.trim(),
              captcha: values.captcha.trim(),
            })
          }
          schema={emailSchema}
          options={{
            defaultValues: { email: user.data?.email ?? '', captcha: '' },
          }}
          className="space-y-4"
        >
          {({ register, formState, getValues, trigger }) => (
            <>
              <div className="flex items-end gap-2">
                <Input
                  label="新邮箱"
                  type="email"
                  className="flex-1"
                  error={formState.errors.email}
                  registration={register('email')}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={running}
                  isLoading={requestMutation.isPending}
                  onClick={async () => {
                    if (!(await trigger('email'))) return;
                    requestMutation.mutate({
                      recipients: getValues('email').trim(),
                    });
                  }}
                >
                  {running ? `${seconds}s 后重发` : '发送验证码'}
                </Button>
              </div>
              <Input
                label="邮箱验证码"
                error={formState.errors.captcha}
                registration={register('captcha')}
              />
            </>
          )}
        </Form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              取消
            </Button>
          </DialogClose>
          <Button
            form="email-form"
            type="submit"
            size="sm"
            isLoading={updateMutation.isPending}
          >
            确认更换
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
