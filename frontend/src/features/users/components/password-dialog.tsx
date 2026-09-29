import { KeyRound } from 'lucide-react';
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
import { useLogout } from '@/lib/auth';

import { useUpdatePassword } from '../api/update-password';

/**
 * 客户端只拦「必填 + 两次一致」；长度与复杂度由后端安全策略裁决
 * （`admin/utils/password_security.py` 读数据库配置：长度上下限、必须含字母/数字/特殊字符），
 * 前端硬编码一份规则只会在策略调整后与后端打架。
 */
const passwordSchema = z
  .object({
    old_password: z.string().min(1, '请输入当前密码'),
    new_password: z.string().min(1, '请输入新密码'),
    confirm_password: z.string().min(1, '请再次输入新密码'),
  })
  .refine((values) => values.new_password === values.confirm_password, {
    path: ['confirm_password'],
    message: '两次输入的新密码不一致',
  });

export function PasswordDialog() {
  const [open, setOpen] = useState(false);
  const { addNotification } = useNotifications();
  const logout = useLogout();

  const mutation = useUpdatePassword({
    mutationConfig: {
      // 后端改密成功后会清掉该用户全部 token，本次会话随即失效；
      // 与其等下一个请求 401，不如主动登出并说明原因。
      onSuccess: () => {
        setOpen(false);
        addNotification({
          type: 'success',
          title: '密码已更新',
          message: '出于安全考虑已退出登录，请用新密码重新登录。',
        });
        logout.mutate(undefined);
      },
      onError: (error) => {
        addNotification({
          type: 'error',
          title: '密码更新失败',
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
          icon={<KeyRound className="size-3.5" />}
        >
          修改密码
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>修改密码</DialogTitle>
          <DialogDescription className="text-xs">
            需先验证当前密码；新密码需满足系统安全策略（含字母与数字，长度有限制）。
            修改成功后当前会话会退出。
          </DialogDescription>
        </DialogHeader>
        <Form
          id="password-form"
          onSubmit={(values) =>
            mutation.mutate({
              old_password: values.old_password,
              new_password: values.new_password,
              confirm_password: values.confirm_password,
            })
          }
          schema={passwordSchema}
          options={{
            defaultValues: {
              old_password: '',
              new_password: '',
              confirm_password: '',
            },
          }}
          className="space-y-4"
        >
          {({ register, formState }) => (
            <>
              <Input
                label="当前密码"
                type="password"
                autoComplete="current-password"
                error={formState.errors.old_password}
                registration={register('old_password')}
              />
              <Input
                label="新密码"
                type="password"
                autoComplete="new-password"
                error={formState.errors.new_password}
                registration={register('new_password')}
              />
              <Input
                label="确认新密码"
                type="password"
                autoComplete="new-password"
                error={formState.errors.confirm_password}
                registration={register('confirm_password')}
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
            form="password-form"
            type="submit"
            size="sm"
            isLoading={mutation.isPending}
          >
            更新密码
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
