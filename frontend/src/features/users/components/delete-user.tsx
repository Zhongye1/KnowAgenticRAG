import { useState } from 'react';

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
import { useNotifications } from '@/components/ui/notifications';
import { useUser } from '@/lib/auth';

import { useDeleteUser } from '../api/delete-user';

type DeleteUserProps = {
  id: string;
};

export const DeleteUser = ({ id }: DeleteUserProps) => {
  const user = useUser();
  const [open, setOpen] = useState(false);
  const { addNotification } = useNotifications();
  const deleteUserMutation = useDeleteUser({
    mutationConfig: {
      onSuccess: () => {
        setOpen(false);
        addNotification({
          type: 'success',
          title: 'User Deleted',
        });
      },
    },
  });

  // 模板 id 是 string，后端用户 id 是 number：显式比较，避免误判（整块待被管理面板取代）
  if (user.data && String(user.data.id) === String(id)) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">Delete</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete User</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this user?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            size="sm"
            disabled={deleteUserMutation.isPending}
            onClick={() => deleteUserMutation.mutate({ userId: id })}
          >
            Delete User
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
