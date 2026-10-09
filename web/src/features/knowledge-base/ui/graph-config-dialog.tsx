/**
 * 图谱抽取配置弹窗。
 *
 * 移植上游 `KnowledgeGraphSection.vue` 的配置弹窗：抽取器卡片（LLM / 更多占位）、模型选择、
 * Schema 文本域、并发数与模型参数 JSON；修改已锁定配置时给一条「只影响后续构建」的提醒。
 *
 * 与上游的两处差异：模型列表取本仓的 `knowledgeApi.listModels('chat')`
 * （上游用 `ModelSelectorComponent` 与全局 `default_model` 兜底，目标端没有那份配置）；
 * 提交前先校验模型必填与参数 JSON，不再让后端返回 400。弹窗由调用方在打开时挂载，
 * 因此表单状态直接用属性初始化，不需要在 effect 里 setState。
 */
import * as React from 'react';
import { BrainCircuit, ScanText } from 'lucide-react';

import type { GraphBuildStatus, GraphExtractorOptions } from '../api/graph-api';
import {
  buildExtractorOptions,
  DEFAULT_GRAPH_CONFIG_FORM,
  EXTRACTOR_TYPE_OPTIONS,
  fillGraphConfigForm,
  MAX_CONCURRENCY,
  MIN_CONCURRENCY,
  validateGraphConfig,
} from '../lib/graph-config';
import { useExtractorModels } from '../model/graph-queries';
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

const EXTRACTOR_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  llm: BrainCircuit,
  more: ScanText,
};

export type GraphConfigDialogProps = {
  status?: GraphBuildStatus | null;
  saving?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: {
    extractorType: string;
    extractorOptions: GraphExtractorOptions;
  }) => void;
};

export const GraphConfigDialog = ({
  status,
  saving = false,
  onOpenChange,
  onSubmit,
}: GraphConfigDialogProps) => {
  const editing = Boolean(status?.locked);
  const [form, setForm] = React.useState(() =>
    status?.config
      ? fillGraphConfigForm(status.config)
      : DEFAULT_GRAPH_CONFIG_FORM,
  );
  const [error, setError] = React.useState('');
  const models = useExtractorModels();
  const modelGroups = Object.values(models.data ?? {});

  const setField = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) => {
    setError('');
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = () => {
    const invalid = validateGraphConfig(form);
    if (invalid) {
      setError(invalid);
      return;
    }
    onSubmit({
      extractorType: form.extractorType,
      extractorOptions: buildExtractorOptions(form),
    });
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>
            {editing ? '修改图谱抽取配置' : '配置图谱抽取器'}
          </DialogTitle>
          <DialogDescription>
            锁定后图谱构建会按这份配置从待构建的 Chunk 里抽取实体与关系。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {editing ? (
            <output className="rounded border border-color-border-1 bg-color-fill-1 px-2 py-1 text-xs text-color-text-2">
              修改配置仅影响后续构建；已构建的图谱不会自动重算，如需一致请重置后重新抽取。
              抽取器类型创建后不可修改。
            </output>
          ) : null}

          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">抽取器类型</legend>
            {EXTRACTOR_TYPE_OPTIONS.map((option) => {
              const Icon = EXTRACTOR_ICONS[option.value];
              const selected = form.extractorType === option.value;
              const locked = editing || option.disabled;
              return (
                <label
                  key={option.value}
                  className={`flex flex-col items-start gap-0.5 rounded border px-3 py-2 ${
                    selected
                      ? 'border-primary-6 bg-primary-1'
                      : 'border-color-border-1'
                  } ${locked ? 'opacity-60' : ''}`}
                >
                  <span className="flex items-center gap-2 text-sm text-color-text-1">
                    <input
                      type="radio"
                      name="graph-extractor-type"
                      value={option.value}
                      checked={selected}
                      disabled={locked}
                      onChange={() => setField('extractorType', option.value)}
                    />
                    <Icon className="size-4" />
                    {option.label}
                  </span>
                  <span className="text-xs text-color-text-3">
                    {option.description}
                  </span>
                  <span className="text-xs text-color-text-3">
                    {option.helper}
                  </span>
                </label>
              );
            })}
          </fieldset>

          <div className="flex flex-col gap-1 text-xs text-color-text-2">
            <span>
              模型<span className="text-danger-6"> *</span>
            </span>
            <Select
              value={form.modelSpec}
              onValueChange={(value) => setField('modelSpec', value)}
            >
              <SelectTrigger aria-label="抽取模型">
                <SelectValue
                  placeholder={
                    models.isLoading
                      ? '正在加载模型…'
                      : models.isError
                        ? '模型列表加载失败'
                        : '选择抽取模型'
                  }
                />
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
            {models.isError ? (
              <span className="text-danger-6">
                模型列表加载失败，先确认模型供应商可用再配置抽取器。
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-1 text-xs text-color-text-2">
            <label htmlFor="graph-schema">Schema</label>
            <textarea
              id="graph-schema"
              rows={6}
              className="rounded border border-color-border-1 bg-color-bg-1 px-2 py-1 text-sm text-color-text-1"
              placeholder="描述实体类型、关系类型和属性约束。后端会把 Schema 拼接到固定抽取 Prompt 中。"
              value={form.schema}
              onChange={(event) => setField('schema', event.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1 text-xs text-color-text-2">
              <label htmlFor="graph-concurrency">LLM 抽取并发数</label>
              <Input
                id="graph-concurrency"
                type="number"
                min={MIN_CONCURRENCY}
                max={MAX_CONCURRENCY}
                value={form.concurrencyCount}
                onChange={(event) =>
                  setField('concurrencyCount', Number(event.target.value))
                }
              />
            </div>
            <div className="flex flex-col gap-1 text-xs text-color-text-2">
              <label htmlFor="graph-model-params">模型参数 JSON</label>
              <Input
                id="graph-model-params"
                placeholder='例如 {"temperature":0.1}'
                value={form.modelParamsText}
                onChange={(event) =>
                  setField('modelParamsText', event.target.value)
                }
              />
            </div>
          </div>

          {error ? (
            <p role="alert" className="text-xs text-danger-6">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button type="button" disabled={saving} onClick={submit}>
            {editing ? '保存配置' : '锁定配置'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
