/**
 * 知识库新建/编辑对话框。
 *
 * 表单默认值、校验与请求体拼装来自 `lib/knowledge-form`；类型专属参数按
 * `create_params.options` 动态渲染，因此不用 react-hook-form 的静态 schema。
 *
 * 分块策略选择器（选项来自 `GET /chunk-presets`）与描述的 AI 生成尚未接入；编辑只提交名称
 * 与描述，不回写 `additional_params`（列表投影里的副本带 `stats` 且按权限脱敏）。
 */
import * as React from 'react';

import type {
  KnowledgeBase,
  KnowledgeTypeInfo,
  KnowledgeTypeParam,
} from '../api/knowledge-api';
import {
  buildCreateRequest,
  createDefaultShareConfig,
  createEmptyKnowledgeBaseForm,
  selectKnowledgeBaseType,
  validateKnowledgeBaseForm,
  type KnowledgeBaseForm,
} from '../lib/knowledge-form';
import {
  useCreateKnowledgeBase,
  useEmbeddingModels,
  useKnowledgeTypes,
  useUpdateKnowledgeBase,
} from '../model/knowledge-queries';
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
import { Spinner } from '@/shared/ui/spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';

type KnowledgeFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 传入表示编辑，不传表示新建。 */
  database?: KnowledgeBase | null;
};

const ParamField = ({
  field,
  value,
  onChange,
}: {
  field: KnowledgeTypeParam;
  value: unknown;
  onChange: (value: unknown) => void;
}) => {
  const label = field.label || field.key;

  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-xs text-color-text-2">
        <input
          type="checkbox"
          className="size-4"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          aria-label={label}
        />
        {label}
      </label>
    );
  }

  return (
    <div className="flex flex-col gap-1 text-xs text-color-text-2">
      <span>
        {label}
        {field.required ? <span className="text-danger-6"> *</span> : null}
      </span>
      <Input
        type={
          field.type === 'password'
            ? 'password'
            : field.type === 'number'
              ? 'number'
              : 'text'
        }
        value={
          typeof value === 'number' || typeof value === 'string' ? value : ''
        }
        placeholder={field.placeholder}
        aria-label={label}
        min={field.min}
        max={field.max}
        onChange={(event) => {
          if (field.type !== 'number') {
            onChange(event.target.value);
            return;
          }
          // 清空或输入 '-'、'e' 时不要写 NaN 进参数
          const parsed = Number(event.target.value);
          onChange(
            event.target.value === '' || !Number.isFinite(parsed) ? '' : parsed,
          );
        }}
      />
      {field.description ? (
        <span className="text-color-text-3">{field.description}</span>
      ) : null}
    </div>
  );
};

export const KnowledgeFormDialog = ({
  open,
  onOpenChange,
  database,
}: KnowledgeFormDialogProps) => {
  const isEdit = Boolean(database);
  // 编辑只改名称与描述：类型表与模型列表都不必取
  const types = useKnowledgeTypes(!isEdit);
  const models = useEmbeddingModels(!isEdit);
  const createMutation = useCreateKnowledgeBase();
  const updateMutation = useUpdateKnowledgeBase(database?.kb_id ?? '');
  // 初始值直接由 props 决定：本组件只在对话框打开期间挂载（父级条件渲染），
  // 因此不需要「打开时重置」的 effect
  const [form, setForm] = React.useState<KnowledgeBaseForm>(() =>
    database
      ? {
          ...createEmptyKnowledgeBaseForm(database.embedding_model_spec ?? ''),
          name: database.name,
          description: database.description ?? '',
          kb_type: database.kb_type,
          additional_params: database.additional_params ?? {},
        }
      : createEmptyKnowledgeBaseForm(),
  );
  const [error, setError] = React.useState('');

  const typeInfo: KnowledgeTypeInfo | undefined = form.kb_type
    ? types.data?.[form.kb_type]
    : undefined;
  const modelGroups = Object.values(models.data ?? {});
  const submitting = createMutation.isPending || updateMutation.isPending;

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const invalid = validateKnowledgeBaseForm(form, typeInfo);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError('');
    try {
      if (database) {
        // 只提交名称与描述：列表返回的 additional_params 里注入了 stats 且可能被按权限脱敏
        await updateMutation.mutateAsync({
          name: form.name.trim(),
          description: form.description.trim(),
        });
      } else {
        await createMutation.mutateAsync(
          // 共享范围在详情页的「共享设置」里配；创建时先用「所有登录用户可读」的默认值
          buildCreateRequest(form, typeInfo, createDefaultShareConfig()),
        );
      }
      onOpenChange(false);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : '保存知识库失败。',
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="knowledge-form-dialog">
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? '编辑知识库' : '新建知识库'}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? '名称与描述对所有可见用户生效；类型不可更改。'
                : '类型决定可用的文档能力与后续参数。'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1 text-xs text-color-text-2">
            <span>
              名称<span className="text-danger-6"> *</span>
            </span>
            <Input
              value={form.name}
              aria-label="知识库名称"
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
            />
          </div>

          <div className="flex flex-col gap-1 text-xs text-color-text-2">
            <span>描述</span>
            <Input
              value={form.description}
              aria-label="知识库描述"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </div>

          {!isEdit ? (
            <div className="flex flex-col gap-1 text-xs text-color-text-2">
              <span>
                类型<span className="text-danger-6"> *</span>
              </span>
              <Select
                value={form.kb_type}
                onValueChange={(value) =>
                  setForm((current) =>
                    selectKnowledgeBaseType(
                      current,
                      value,
                      types.data?.[value],
                    ),
                  )
                }
              >
                <SelectTrigger aria-label="知识库类型">
                  <SelectValue placeholder="请选择类型" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(types.data ?? {}).map(([value, info]) => (
                    <SelectItem key={value} value={value}>
                      {info.name || value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {(typeInfo?.create_params?.options ?? []).map((field) => (
            <ParamField
              key={field.key}
              field={field}
              value={form.additional_params[field.key]}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  additional_params: {
                    ...current.additional_params,
                    [field.key]: value,
                  },
                }))
              }
            />
          ))}

          {!isEdit && typeInfo?.requires_embedding_model ? (
            <div className="flex flex-col gap-1 text-xs text-color-text-2">
              <span>
                嵌入模型<span className="text-danger-6"> *</span>
              </span>
              <Select
                value={form.embedding_model_spec}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    embedding_model_spec: value,
                  }))
                }
              >
                <SelectTrigger aria-label="嵌入模型">
                  <SelectValue placeholder="请选择嵌入模型" />
                </SelectTrigger>
                <SelectContent>
                  {modelGroups.flatMap((group) =>
                    group.models.map((model) => (
                      <SelectItem key={model.spec} value={model.spec}>
                        {group.provider_display_name} ·{' '}
                        {model.display_name || model.model_id}
                      </SelectItem>
                    )),
                  )}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-xs text-danger-6">
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
            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner aria-hidden className="size-4" /> : null}
              {isEdit ? '保存' : '创建'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
