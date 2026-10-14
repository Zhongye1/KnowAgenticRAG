/**
 * 新建文件夹弹窗。
 *
 * 对齐参照 `WorkspaceView.vue` 的同名弹窗：标题「新建文件夹」、确定「创建」、取消「取消」，
 * 输入框占位「请输入文件夹名称」，回车与确定是同一个动作；创建中禁用输入并给按钮加载态。
 */
import * as React from 'react';

import { Input, Modal } from 'antd';

type CreateDirectoryDialogProps = {
  open: boolean;
  creating: boolean;
  onOpenChange: (open: boolean) => void;
  /** 返回是否创建成功：成功才关闭弹窗并清空输入。 */
  onSubmit: (name: string) => Promise<boolean>;
};

export const CreateDirectoryDialog = ({
  open,
  creating,
  onOpenChange,
  onSubmit,
}: CreateDirectoryDialogProps) => {
  const [name, setName] = React.useState('');

  const submit = async () => {
    const created = await onSubmit(name);
    if (!created) return;
    setName('');
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      title="新建文件夹"
      okText="创建"
      cancelText="取消"
      confirmLoading={creating}
      onCancel={() => onOpenChange(false)}
      onOk={() => void submit()}
    >
      <Input
        value={name}
        placeholder="请输入文件夹名称"
        disabled={creating}
        onChange={(event) => setName(event.target.value)}
        onPressEnter={() => void submit()}
      />
    </Modal>
  );
};
