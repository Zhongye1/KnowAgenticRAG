/**
 * 文件行的操作菜单。
 *
 * 按能力矩阵决定有哪些项：虚拟目录没有任何操作，目录有移动与删除，文件有下载、解析或入库、
 * 重新入库、移动与删除。动作本身由表格实现（它持有 mutation 与确认框），这里只管呈现。
 */
import {
  Database,
  Download,
  FileText,
  FolderInput,
  MoreHorizontal,
  RotateCw,
  Trash2,
} from 'lucide-react';

import type { KnowledgeFileItem } from '../api/knowledge-api';
import {
  canDeleteFile,
  canDownloadFile,
  canParseFile,
  canReindexFile,
  FILE_ACTIONS,
  getFilePrimaryAction,
} from '../lib/knowledge-files';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

type FileRowActionsProps = {
  file: KnowledgeFileItem;
  /** 只读知识库：只留下载。 */
  readOnly: boolean;
  /** 有操作在飞行中：会改状态的入口先关掉。 */
  locked: boolean;
  onDownload: (file: KnowledgeFileItem) => void;
  onParse: (file: KnowledgeFileItem) => void;
  onIndex: (file: KnowledgeFileItem) => void;
  onMove: (file: KnowledgeFileItem) => void;
  onDelete: (file: KnowledgeFileItem) => void;
};

export const FileRowActions = ({
  file,
  readOnly,
  locked,
  onDownload,
  onParse,
  onIndex,
  onMove,
  onDelete,
}: FileRowActionsProps) => {
  // 虚拟目录没有实体记录，不给操作入口
  if (file.is_virtual_folder) return null;

  const primaryAction = getFilePrimaryAction(file);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`文件操作：${file.filename}`}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {file.is_folder ? (
          <>
            {readOnly ? null : (
              <DropdownMenuItem disabled={locked} onSelect={() => onMove(file)}>
                <FolderInput className="size-4" aria-hidden />
                移动到…
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              variant="destructive"
              // 目录没有解析/入库状态，只看只读标记；批量删除才按能力矩阵过滤
              disabled={readOnly || locked}
              onSelect={() => onDelete(file)}
            >
              <Trash2 className="size-4" aria-hidden />
              删除文件夹
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem
              disabled={locked || !canDownloadFile(file)}
              onSelect={() => onDownload(file)}
            >
              <Download className="size-4" aria-hidden />
              下载文件
            </DropdownMenuItem>
            {!readOnly && canParseFile(file) ? (
              <DropdownMenuItem
                disabled={locked}
                onSelect={() => onParse(file)}
              >
                <FileText className="size-4" aria-hidden />
                {primaryAction?.label ?? '解析文件'}
              </DropdownMenuItem>
            ) : null}
            {!readOnly && primaryAction?.type === FILE_ACTIONS.INDEX ? (
              <DropdownMenuItem
                disabled={locked}
                onSelect={() => onIndex(file)}
              >
                <Database className="size-4" aria-hidden />
                {primaryAction.label}
              </DropdownMenuItem>
            ) : null}
            {!readOnly && canReindexFile(file) ? (
              <DropdownMenuItem
                disabled={locked}
                onSelect={() => onIndex(file)}
              >
                <RotateCw className="size-4" aria-hidden />
                重新入库
              </DropdownMenuItem>
            ) : null}
            {readOnly ? null : (
              <>
                <DropdownMenuItem
                  disabled={locked}
                  onSelect={() => onMove(file)}
                >
                  <FolderInput className="size-4" aria-hidden />
                  移动到…
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!canDeleteFile(file, locked)}
                  onSelect={() => onDelete(file)}
                >
                  <Trash2 className="size-4" aria-hidden />
                  删除文件
                </DropdownMenuItem>
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
