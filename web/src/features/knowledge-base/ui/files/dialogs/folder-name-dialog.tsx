/**
 * 文件夹命名弹窗：新建与重命名共用一个输入形态。
 *
 * 校验与文案对齐参照 `FileTable.vue` 的两个处理器：空名警告「请输入文件夹名称」，
 * 成功提示「创建成功 / 重命名成功」。
 */
import * as React from 'react';
import { Button, Input, Modal } from 'antd';

export const FolderNameDialog = ({
  open,
  mode,
  initialName = '',
  submitting = false,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode: 'create' | 'rename';
  /** 重命名时的当前名称。 */
  initialName?: string;
  submitting?: boolean;
  onOpenChange: (open: boolean) => void;
  /** 名称为空时由调用方警告；这里只负责把 trim 后的名字交出去。 */
  onSubmit: (folderName: string) => void;
}) => {
  const [name, setName] = React.useState(initialName);

  // 打开时重置：新建给空、重命名回填当前名
  React.useEffect(() => {
    if (open) setName(initialName);
  }, [initialName, open]);

  return (
    <Modal
      open={open}
      title={mode === 'create' ? '新建文件夹' : '重命名文件夹'}
      onCancel={() => onOpenChange(false)}
      footer={
        <>
          <Button htmlType="button" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            htmlType="button"
            type="primary"
            loading={submitting}
            onClick={() => onSubmit(name.trim())}
          >
            {mode === 'create' ? '创建' : '保存'}
          </Button>
        </>
      }
    >
      <Input
        value={name}
        autoFocus
        aria-label="文件夹名称"
        placeholder="请输入文件夹名称"
        onChange={(event) => setName(event.target.value)}
        onPressEnter={() => onSubmit(name.trim())}
      />
    </Modal>
  );
};
