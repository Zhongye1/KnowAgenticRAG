/**
 * 模型配置对话框（手动添加与编辑共用）。
 *
 * 手动添加时模型 ID 可编辑、类型受供应商能力约束，编辑时 ID 只读；请求参数 JSON
 * 解析失败当场给出原因，不提交。`dimension` 只在 embedding 出现，`batch_size` 在
 * embedding 与 rerank 出现。
 */
import * as React from 'react';

import type {
  EnabledModel,
  ModelProvider,
  ModelType,
} from '../api/model-provider-api';
import {
  buildModelPayload,
  editingModelTypeOptions,
  emptyModelForm,
  modelFormValue,
  type ModelForm,
} from '../lib/provider-view';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';

const REQUEST_BODY_PLACEHOLDER = '{\n  "enable_thinking": false\n}';

/** 后端 `ALLOWED_EXTRA_BODY_FIELDS`：只允许这五个字段，其它值会被 400 拒绝。 */
const ALLOWED_EXTRA_BODY_FIELDS = [
  'enable_thinking',
  'thinking_budget',
  'thinking',
  'reasoning',
  'reasoning_effort',
] as const;

type ModelFormDialogProps = {
  onOpenChange: (open: boolean) => void;
  provider: ModelProvider | null;
  /** 传入表示编辑已有模型，不传表示手动添加。 */
  model: EnabledModel | null;
  saving: boolean;
  onSave: (form: ModelForm, isCreate: boolean) => void;
};

const Field = ({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) => (
  <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-color-text-2">
    <span>{label}</span>
    {children}
  </label>
);

export const ModelFormDialog = ({
  onOpenChange,
  provider,
  model,
  saving,
  onSave,
}: ModelFormDialogProps) => {
  // 初始值直接由 props 决定：父级在打开时才挂载本组件
  const [form, setForm] = React.useState<ModelForm>(() =>
    model
      ? modelFormValue(model)
      : emptyModelForm(provider ?? ({} as ModelProvider)),
  );
  const [error, setError] = React.useState('');

  const update = <K extends keyof ModelForm>(key: K, value: ModelForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const typeOptions = editingModelTypeOptions(provider?.capabilities ?? []);

  const submit = () => {
    try {
      buildModelPayload(form);
    } catch (parseError) {
      setError(
        parseError instanceof Error ? parseError.message : 'JSON 格式不正确',
      );
      return;
    }
    setError('');
    onSave(form, !model);
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent data-testid="model-form-dialog">
        <DialogHeader>
          <DialogTitle>{model ? '模型配置' : '手动添加模型'}</DialogTitle>
          <DialogDescription>
            请求参数只对 OpenAI 兼容供应商的 chat 模型生效，经 extra_body 透传。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {model ? (
            <p className="flex flex-col gap-1 text-xs text-color-text-2">
              <span>模型 ID</span>
              <code className="text-sm break-all text-color-text-1">
                {model.id}
              </code>
            </p>
          ) : (
            <Field label={<span>模型 ID</span>}>
              <Input
                value={form.id}
                aria-label="模型 ID"
                placeholder="例如 BAAI/bge-m3"
                onChange={(event) => update('id', event.target.value)}
              />
            </Field>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Field label="展示名称">
              <Input
                value={form.display_name}
                aria-label="展示名称"
                onChange={(event) => update('display_name', event.target.value)}
              />
            </Field>
            <Field label="模型类型">
              <Select
                value={form.type}
                onValueChange={(value) => update('type', value as ModelType)}
              >
                <SelectTrigger aria-label="模型类型">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Field label="协议覆盖">
              <Input
                value={form.protocol_override}
                aria-label="协议覆盖"
                placeholder="可选"
                onChange={(event) =>
                  update('protocol_override', event.target.value)
                }
              />
            </Field>
            <Field label="Base URL 覆盖">
              <Input
                value={form.base_url_override}
                aria-label="Base URL 覆盖"
                placeholder="可选"
                onChange={(event) =>
                  update('base_url_override', event.target.value)
                }
              />
            </Field>
          </div>

          <Field
            label={
              <>
                模型请求参数 JSON
                <span className="block text-color-text-3">
                  仅 OpenAI 兼容供应商（含 OpenRouter）的 chat 模型会经
                  extra_body 透传； 允许字段：
                  {ALLOWED_EXTRA_BODY_FIELDS.join('、')}。
                </span>
              </>
            }
          >
            <Textarea
              rows={6}
              value={form.request_body_overrides_text}
              aria-label="模型请求参数 JSON"
              placeholder={REQUEST_BODY_PLACEHOLDER}
              onChange={(event) =>
                update('request_body_overrides_text', event.target.value)
              }
            />
          </Field>

          <div className="flex flex-col gap-3 sm:flex-row">
            {form.type === 'embedding' ? (
              <Field label="维度">
                <Input
                  type="number"
                  min={1}
                  value={form.dimension ?? ''}
                  aria-label="维度"
                  onChange={(event) =>
                    update(
                      'dimension',
                      event.target.value === ''
                        ? null
                        : Number(event.target.value),
                    )
                  }
                />
              </Field>
            ) : null}
            {form.type === 'embedding' || form.type === 'rerank' ? (
              <Field label="Batch Size">
                <Input
                  type="number"
                  min={1}
                  value={form.batch_size ?? ''}
                  aria-label="Batch Size"
                  onChange={(event) =>
                    update(
                      'batch_size',
                      event.target.value === ''
                        ? null
                        : Number(event.target.value),
                    )
                  }
                />
              </Field>
            ) : null}
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-danger-6">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button type="button" isLoading={saving} onClick={submit}>
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
