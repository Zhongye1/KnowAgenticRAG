import { Pen } from 'lucide-react';
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

import { useUpdateNickname } from '../api/update-nickname';

const nicknameSchema = z.object({
  nickname: z
    .string()
    .trim()
    .min(1, '昵称不能为空')
    .max(32, '昵称最多 32 个字符'),
});

/**
 * 改昵称。`DialogContent` 关闭即卸载，所以每次打开都会用当前昵称重新初始化表单，
 * 不需要额外同步 state。
 */
export function NicknameDialog() {
  const [open, setOpen] = useState(false);
  const user = useUser();
  const { addNotification } = useNotifications();

  const mutation = useUpdateNickname({
    mutationConfig: {
      onSuccess: () => {
        setOpen(false);
        addNotification({ type: 'success', title: '昵称已更新' });
      },
      onError: (error) => {
        addNotification({
          type: 'error',
          title: '昵称更新失败',
          message: getApiErrorMessage(error),
        });
      },
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" icon={<Pen className="size-3.5" />}>
          修改昵称
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>修改昵称</DialogTitle>
          <DialogDescription className="text-xs">
            昵称用于界面展示，登录仍使用用户名。
          </DialogDescription>
        </DialogHeader>
        <Form
          id="nickname-form"
          onSubmit={(values) => mutation.mutate({ nickname: values.nickname })}
          schema={nicknameSchema}
          options={{ defaultValues: { nickname: user.data?.nickname ?? '' } }}
          className="space-y-4"
        >
          {({ register, formState }) => (
            <Input
              label="昵称"
              error={formState.errors.nickname}
              registration={register('nickname')}
            />
          )}
        </Form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              取消
            </Button>
          </DialogClose>
          <Button
            form="nickname-form"
            type="submit"
            size="sm"
            isLoading={mutation.isPending}
          >
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
