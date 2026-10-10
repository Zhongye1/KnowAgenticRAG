/**
 * 供应商新建/编辑对话框。
 *
 * 字段与默认值由 `lib/provider-view.ts` 的表单折算决定。密钥不回显：编辑态密钥框为空，
 * 留空即不改动已配置的密钥，勾选「清除已配置的 API Key」才显式下发 `null`；
 * 供应商类型列后端白名单的四项，能力用三个复选框。
 */
import * as React from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';

import type {
  ModelProvider,
  ModelType,
  ProviderType,
} from '../api/model-provider-api';
import {
  buildProviderPayload,
  CAPABILITY_OPTIONS,
  emptyProviderForm,
  PROVIDER_TYPE_OPTIONS,
  providerFormValue,
  type ProviderForm,
} from '../lib/provider-view';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/shared/ui/collapsible';
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
import { Switch } from '@/shared/ui/switch';
import { Textarea } from '@/shared/ui/textarea';

type ProviderFormDialogProps = {
  onOpenChange: (open: boolean) => void;
  /** 传入表示编辑，不传表示新建。 */
  provider: ModelProvider | null;
  /** 保存或删除请求在飞行中。 */
  saving: boolean;
  /** 保存：`enable` 为真时强制启用（「保存并启用」）。 */
  onSubmit: (form: ProviderForm, options: { enable: boolean }) => void;
  onDelete: (provider: ModelProvider) => void;
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

export const ProviderFormDialog = ({
  onOpenChange,
  provider,
  saving,
  onSubmit,
  onDelete,
}: ProviderFormDialogProps) => {
  // 初始值直接由 props 决定：本组件只在对话框打开期间挂载（父级条件渲染），
  // 因此不需要「打开时重置」的 effect；密钥每次从空开始
  const [form, setForm] = React.useState<ProviderForm>(() =>
    provider ? providerFormValue(provider) : emptyProviderForm(),
  );
  const [error, setError] = React.useState('');

  const update = <K extends keyof ProviderForm>(
    key: K,
    value: ProviderForm[K],
  ) => setForm((current) => ({ ...current, [key]: value }));

  const submit = (options: { enable: boolean }) => {
    try {
      buildProviderPayload(form);
    } catch (parseError) {
      setError(
        parseError instanceof Error ? parseError.message : 'JSON 格式不正确',
      );
      return;
    }
    setError('');
    onSubmit(form, options);
  };

  const toggleCapability = (capability: ModelType, checked: boolean) => {
    setForm((current) => ({
      ...current,
      capabilities: checked
        ? [...current.capabilities, capability]
        : current.capabilities.filter((item) => item !== capability),
    }));
  };

  const editing = Boolean(provider);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="provider-form-dialog"
        className="sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>{editing ? '编辑供应商' : '新增供应商'}</DialogTitle>
          <DialogDescription>
            供应商决定模型调用的地址与凭据；密钥保存后不再回显。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Field label="Provider ID">
              <Input
                value={form.provider_id}
                disabled={editing}
                aria-label="Provider ID"
                placeholder="my-provider"
                onChange={(event) => update('provider_id', event.target.value)}
              />
            </Field>
            <Field label="展示名称">
              <Input
                value={form.display_name}
                aria-label="展示名称"
                placeholder="My Provider"
                onChange={(event) => update('display_name', event.target.value)}
              />
            </Field>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Field label="Base URL">
              <Input
                value={form.base_url}
                aria-label="Base URL"
                placeholder="https://api.example.com/v1"
                onChange={(event) => update('base_url', event.target.value)}
              />
            </Field>
            <Field label="Provider Type">
              <Select
                value={form.provider_type}
                onValueChange={(value) =>
                  update('provider_type', value as ProviderType)
                }
              >
                <SelectTrigger aria-label="Provider Type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Field label="API Key Env">
              <Input
                value={form.api_key_env}
                aria-label="API Key Env"
                placeholder="环境变量名"
                onChange={(event) => update('api_key_env', event.target.value)}
              />
            </Field>
            <Field
              label={
                editing && provider?.has_api_key
                  ? 'API Key（已配置，留空不改动）'
                  : 'API Key'
              }
            >
              <Input
                type="password"
                value={form.api_key}
                aria-label="API Key"
                autoComplete="new-password"
                placeholder={
                  editing && provider?.has_api_key
                    ? '已配置，留空表示不修改'
                    : ''
                }
                disabled={form.clear_api_key}
                onChange={(event) => update('api_key', event.target.value)}
              />
            </Field>
          </div>

          {editing && provider?.has_api_key ? (
            <div className="flex items-center gap-2 text-xs text-color-text-2">
              <Checkbox
                id="clear-api-key"
                checked={form.clear_api_key}
                onCheckedChange={(checked) =>
                  update('clear_api_key', checked === true)
                }
              />
              <label htmlFor="clear-api-key">
                清除已配置的 API Key（下拉直连密钥，改用环境变量时勾选）
              </label>
            </div>
          ) : null}

          <Field label="Models Endpoint">
            <Input
              value={form.models_endpoint}
              aria-label="Models Endpoint"
              placeholder="/models"
              onChange={(event) =>
                update('models_endpoint', event.target.value)
              }
            />
          </Field>

          {form.capabilities.includes('embedding') ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Field label="Embedding Base URL">
                <Input
                  value={form.embedding_base_url}
                  aria-label="Embedding Base URL"
                  placeholder="https://api.example.com/v1/embeddings"
                  onChange={(event) =>
                    update('embedding_base_url', event.target.value)
                  }
                />
              </Field>
              <Field label="Embedding Endpoint">
                <Input
                  value={form.embedding_models_endpoint}
                  aria-label="Embedding Endpoint"
                  placeholder="/embeddings/models"
                  onChange={(event) =>
                    update('embedding_models_endpoint', event.target.value)
                  }
                />
              </Field>
            </div>
          ) : null}

          {form.capabilities.includes('rerank') ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Field label="Rerank Base URL">
                <Input
                  value={form.rerank_base_url}
                  aria-label="Rerank Base URL"
                  placeholder="https://api.example.com/v1/rerank"
                  onChange={(event) =>
                    update('rerank_base_url', event.target.value)
                  }
                />
              </Field>
              <Field label="Rerank Endpoint">
                <Input
                  value={form.rerank_models_endpoint}
                  aria-label="Rerank Endpoint"
                  placeholder="按供应商文档填写，留空则不自动加载"
                  onChange={(event) =>
                    update('rerank_models_endpoint', event.target.value)
                  }
                />
              </Field>
            </div>
          ) : null}

          <fieldset className="flex flex-col gap-2">
            <legend className="text-xs text-color-text-2">能力</legend>
            <div className="flex flex-wrap gap-4">
              {CAPABILITY_OPTIONS.map((capability) => (
                <label
                  key={capability}
                  className="flex items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={form.capabilities.includes(capability)}
                    aria-label={capability}
                    onCheckedChange={(checked) =>
                      toggleCapability(capability, checked === true)
                    }
                  />
                  {capability}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex items-center gap-3 text-xs text-color-text-2">
            <span>状态</span>
            <Switch
              checked={form.is_enabled}
              aria-label="启用供应商"
              onCheckedChange={(checked) => update('is_enabled', checked)}
            />
            <span>{form.is_enabled ? '启用' : '停用'}</span>
          </div>

          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
              >
                <ChevronDown className="size-3.5" aria-hidden />
                高级配置
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col gap-3 pt-2">
              <Field label="请求头 JSON">
                <Textarea
                  rows={4}
                  value={form.headers_text}
                  aria-label="请求头 JSON"
                  placeholder="{}"
                  onChange={(event) =>
                    update('headers_text', event.target.value)
                  }
                />
              </Field>
              <Field label="扩展配置 JSON">
                <Textarea
                  rows={4}
                  value={form.extra_text}
                  aria-label="扩展配置 JSON"
                  placeholder="{}"
                  onChange={(event) => update('extra_text', event.target.value)}
                />
              </Field>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-danger-6">
            {error}
          </p>
        ) : null}

        <DialogFooter className="sm:justify-between">
          <div>
            {editing && provider ? (
              <Button
                type="button"
                variant="destructive"
                icon={<Trash2 className="size-3.5" aria-hidden />}
                disabled={saving}
                onClick={() => onDelete(provider)}
              >
                删除供应商
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            {editing && !form.is_enabled ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  isLoading={saving}
                  onClick={() => submit({ enable: false })}
                >
                  仅保存
                </Button>
                <Button
                  type="button"
                  isLoading={saving}
                  onClick={() => submit({ enable: true })}
                >
                  保存并启用
                </Button>
              </>
            ) : (
              <Button
                type="button"
                isLoading={saving}
                onClick={() => submit({ enable: false })}
              >
                确认
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
