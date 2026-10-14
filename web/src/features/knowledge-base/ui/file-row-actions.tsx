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
import { Button, Dropdown } from 'antd';

import type { KnowledgeFileItem } from '../api/knowledge-api';
import {
  canDeleteFile,
  canDownloadFile,
  canParseFile,
  canReindexFile,
  FILE_ACTIONS,
  getFilePrimaryAction,
} from '../lib/knowledge-files';

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
    <Dropdown
      trigger={['click']}
      menu={{
        items: file.is_folder
          ? [
              ...(readOnly
                ? []
                : [
                    {
                      key: 'move',
                      label: (
                        <span className="flex items-center gap-2">
                          <FolderInput className="size-4" aria-hidden />
                          移动到…
                        </span>
                      ),
                      disabled: locked,
                    },
                  ]),
              {
                key: 'delete-folder',
                // 目录没有解析/入库状态，只看只读标记；批量删除才按能力矩阵过滤
                label: (
                  <span className="flex items-center gap-2">
                    <Trash2 className="size-4" aria-hidden />
                    删除文件夹
                  </span>
                ),
                disabled: readOnly || locked,
                danger: true,
              },
            ]
          : [
              {
                key: 'download',
                label: (
                  <span className="flex items-center gap-2">
                    <Download className="size-4" aria-hidden />
                    下载文件
                  </span>
                ),
                disabled: locked || !canDownloadFile(file),
              },
              ...(!readOnly && canParseFile(file)
                ? [
                    {
                      key: 'parse',
                      label: (
                        <span className="flex items-center gap-2">
                          <FileText className="size-4" aria-hidden />
                          {primaryAction?.label ?? '解析文件'}
                        </span>
                      ),
                      disabled: locked,
                    },
                  ]
                : []),
              ...(!readOnly && primaryAction?.type === FILE_ACTIONS.INDEX
                ? [
                    {
                      key: 'index',
                      label: (
                        <span className="flex items-center gap-2">
                          <Database className="size-4" aria-hidden />
                          {primaryAction.label}
                        </span>
                      ),
                      disabled: locked,
                    },
                  ]
                : []),
              ...(!readOnly && canReindexFile(file)
                ? [
                    {
                      key: 'reindex',
                      label: (
                        <span className="flex items-center gap-2">
                          <RotateCw className="size-4" aria-hidden />
                          重新入库
                        </span>
                      ),
                      disabled: locked,
                    },
                  ]
                : []),
              ...(readOnly
                ? []
                : [
                    {
                      key: 'move',
                      label: (
                        <span className="flex items-center gap-2">
                          <FolderInput className="size-4" aria-hidden />
                          移动到…
                        </span>
                      ),
                      disabled: locked,
                    },
                    {
                      key: 'delete-file',
                      label: (
                        <span className="flex items-center gap-2">
                          <Trash2 className="size-4" aria-hidden />
                          删除文件
                        </span>
                      ),
                      disabled: !canDeleteFile(file, locked),
                      danger: true,
                    },
                  ]),
            ],
        onClick: ({ key }) => {
          if (key === 'move') onMove(file);
          if (key === 'delete-folder' || key === 'delete-file') onDelete(file);
          if (key === 'download') onDownload(file);
          if (key === 'parse') onParse(file);
          if (key === 'index' || key === 'reindex') onIndex(file);
        },
      }}
    >
      <Button
        htmlType="button"
        type="text"
        size="small"
        aria-label={`文件操作：${file.filename}`}
      >
        <MoreHorizontal className="size-4" />
      </Button>
    </Dropdown>
  );
};
