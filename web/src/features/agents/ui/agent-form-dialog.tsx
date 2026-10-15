/** 新增/编辑智能体的对话框。 */
import * as React from 'react';
import { ImagePlus } from 'lucide-react';

import { Button, Input, Modal, Select, Spin, Upload } from 'antd';
import type { Agent, AgentBackend } from '@/entities/agent';
import { uploadAgentIcon } from '@/entities/agent';
import { useNotifications } from '@/shared/ui/notifications';

import {
  agentFormFrom,
  emptyAgentForm,
  validateAgentForm,
  type AgentForm,
} from '../lib/agent-form';

export type AgentFormDialogProps = {
  /** 编辑时传入当前智能体；新建时为 `null`。 */
  agent: Agent | null;
  backends: AgentBackend[];
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  /** 提交表单；失败时由面板给出通知，这里只负责把错误显示在对话框里。 */
  onSubmit: (form: AgentForm) => Promise<string | null>;
};

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-color-text-2">
    <span>{label}</span>
    {children}
  </label>
);

export const AgentFormDialog = ({
  agent,
  backends,
  saving,
  onOpenChange,
  onSubmit,
}: AgentFormDialogProps) => {
  const notifications = useNotifications();
  const isCreate = agent === null;
  const [form, setForm] = React.useState<AgentForm>(() =>
    agent ? agentFormFrom(agent) : emptyAgentForm(backends[0]?.id ?? ''),
  );
  const [error, setError] = React.useState('');
  const [uploading, setUploading] = React.useState(false);

  const update = <Key extends keyof AgentForm>(
    key: Key,
    value: AgentForm[Key],
  ) => {
    setError('');
    setForm((current) => ({ ...current, [key]: value }));
  };

  // 后端列表是异步来的：到了之后补上默认值；用户已经选过就不覆盖
  React.useEffect(() => {
    if (!isCreate) return;
    const fallback = backends[0]?.id;
    if (!fallback) return;
    setForm((current) =>
      current.backendId ? current : { ...current, backendId: fallback },
    );
  }, [backends, isCreate]);

  const uploadIcon = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadAgentIcon(file);
      update('icon', url);
      notifications.addNotification({
        type: 'success',
        title: '智能体图标',
        message: '图标上传成功。',
      });
    } catch (uploadError) {
      notifications.addNotification({
        type: 'error',
        title: '智能体图标',
        message:
          uploadError instanceof Error ? uploadError.message : '图标上传失败。',
      });
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    const invalid = validateAgentForm(form);
    if (invalid) {
      setError(invalid);
      return;
    }
    const failure = await onSubmit(form);
    if (failure) setError(failure);
  };

  return (
    <Modal
      open
      onCancel={() => onOpenChange(false)}
      width={560}
      data-testid="agent-form-dialog"
      title={isCreate ? '新增智能体' : '编辑智能体'}
      footer={null}
    >
      <div className="flex flex-col gap-3">
        <Field label="名称">
          <Input
            value={form.name}
            aria-label="智能体名称"
            placeholder="例如：合同审阅助手"
            onChange={(event) => update('name', event.target.value)}
          />
        </Field>

        {isCreate ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Field label="标识（留空按名称生成）">
              <Input
                value={form.slug}
                aria-label="智能体标识"
                placeholder="contract-review"
                onChange={(event) => update('slug', event.target.value)}
              />
            </Field>
            <Field label="智能体后端">
              <Select
                value={form.backendId || undefined}
                aria-label="智能体后端"
                placeholder="选择后端"
                options={backends.map((backend) => ({
                  value: backend.id,
                  label: backend.name,
                }))}
                onChange={(value: string) => update('backendId', value)}
              />
            </Field>
          </div>
        ) : (
          <p className="text-xs text-color-text-3">
            标识与后端创建后不可改：{form.slug}
          </p>
        )}

        <Field label="描述">
          <Input.TextArea
            value={form.description}
            aria-label="智能体描述"
            rows={3}
            placeholder="可选"
            onChange={(event) => update('description', event.target.value)}
          />
        </Field>

        <div className="flex items-center gap-3 text-xs text-color-text-2">
          <span>图标</span>
          <Upload
            accept="image/*"
            showUploadList={false}
            disabled={uploading}
            beforeUpload={(file) => {
              void uploadIcon(file as unknown as File);
              return false;
            }}
          >
            <Button htmlType="button" size="small" disabled={uploading}>
              {uploading ? <Spin aria-hidden className="size-3.5" /> : null}
              <ImagePlus className="size-4" aria-hidden />
              {form.icon ? '更换图标' : '上传图标'}
            </Button>
          </Upload>
          {form.icon ? (
            <img
              className="size-8 rounded-[7px] border border-color-border-1 object-cover"
              src={form.icon}
              alt="智能体图标预览"
            />
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="text-xs text-danger-6">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button htmlType="button" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            htmlType="button"
            type="primary"
            loading={saving}
            onClick={() => void submit()}
          >
            {isCreate ? '创建' : '保存'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
