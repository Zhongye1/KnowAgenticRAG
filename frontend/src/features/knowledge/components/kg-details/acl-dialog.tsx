import { ShieldCheck } from 'lucide-react';

import { KbAclEditor } from '@/components/knowledge-acl/kb-acl-editor';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * 知识库授权入口（KB 详情页内）。
 *
 * 与管理面板的「知识库授权」页共用同一个 `KbAclEditor`：那边是全局按库找，
 * 这边是在上下文中直接改本库，避免为了加一条授权跳到另一个页面。
 */
export function AclDialog({
  kbName,
  open,
  onOpenChange,
}: {
  kbName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="size-4" />
            知识库授权
          </DialogTitle>
          <DialogDescription className="text-xs">
            管理 <span className="font-mono">{kbName}</span>{' '}
            的访问条目。文档级授权（进一步收窄）在文档详情里配置。
          </DialogDescription>
        </DialogHeader>
        <KbAclEditor kbName={kbName} />
      </DialogContent>
    </Dialog>
  );
}
