/**
 * 命令式确认框的渲染出口。挂一次在外壳里，内容由 `confirm()` 的请求驱动。
 */
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';

import { useConfirmStore } from './confirm-dialog';

export const ConfirmDialogHost = () => {
  const pending = useConfirmStore((state) => state.pending);
  const settle = useConfirmStore((state) => state.settle);
  const options = pending?.options;

  return (
    <Dialog open={Boolean(pending)} onOpenChange={(open) => !open && settle(false)}>
      <DialogContent data-testid="confirm-dialog">
        <DialogHeader>
          <DialogTitle>{options?.title}</DialogTitle>
          {options?.description ? (
            <DialogDescription>{options.description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => settle(false)}>
            {options?.cancelText}
          </Button>
          <Button
            type="button"
            variant={options?.destructive ? 'destructive' : 'default'}
            onClick={() => settle(true)}
          >
            {options?.confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
