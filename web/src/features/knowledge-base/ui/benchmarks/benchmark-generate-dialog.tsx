/**
 * 自动生成评估基准弹窗。
 *
 * 名称、说明、生成方式（向量 / 图增强）、LLM 模型、题目数量、参考 Chunk 数、并发数与图谱
 * 扩散数（仅图增强出现）。图增强要求知识库已经构建过图谱（`indexed_chunks > 0`），这里直接
 * 读图谱构建状态判断并禁用该选项。
 */
import * as React from 'react';
import { Boxes, GitBranch, Sparkles } from 'lucide-react';
import { Button, Input, Modal, Select, Spin } from 'antd';

import { useSystemConfig } from '@/entities/system-config';

import {
  buildDefaultBenchmarkName,
  buildGeneratePayload,
  GENERATE_LIMITS,
  validateGenerateForm,
} from '../../lib/evaluation-form';
import { useGenerateEvaluationDataset } from '../../model/evaluation-queries';
import {
  useExtractorModels,
  useGraphBuildStatus,
} from '../../model/graph-queries';

/** 表单状态：数值字段显式标成 number，否则 `as const` 的默认值会把类型钉成字面量。 */
type GenerateFormState = {
  name: string;
  description: string;
  generationMode: 'vector' | 'graph_enhanced';
  llmModelSpec: string;
  count: number;
  neighborsCount: number;
  concurrencyCount: number;
  graphExpandTopK: number;
};

export type BenchmarkGenerateDialogProps = {
  kbId: string;
  onOpenChange: (open: boolean) => void;
  /** 受理成功后回调（关闭弹窗的原因可能是取消）。 */
  onGenerated?: () => void;
};

const MODES = [
  {
    value: 'vector' as const,
    label: '向量构建',
    tag: '默认',
    description: '基于向量相似度召回 chunks，稳定适用于所有知识库。',
  },
  {
    value: 'graph_enhanced' as const,
    label: '图增强构建',
    tag: '图谱',
    description: '在向量召回基础上结合知识图谱扩展相关 chunks。',
  },
];

export const BenchmarkGenerateDialog = ({
  kbId,
  onOpenChange,
  onGenerated,
}: BenchmarkGenerateDialogProps) => {
  const generate = useGenerateEvaluationDataset(kbId);
  const models = useExtractorModels();
  const graphStatus = useGraphBuildStatus(kbId);
  const indexedChunks = graphStatus.data?.indexed_chunks ?? 0;

  const [form, setForm] = React.useState<GenerateFormState>(() => ({
    name: buildDefaultBenchmarkName(),
    description: '',
    generationMode: 'vector',
    llmModelSpec: '',
    count: GENERATE_LIMITS.count.default,
    neighborsCount: GENERATE_LIMITS.neighbors.default,
    concurrencyCount: GENERATE_LIMITS.concurrency.default,
    graphExpandTopK: GENERATE_LIMITS.graphExpandTopK.default,
  }));
  const [error, setError] = React.useState('');

  /*
   * LLM 模型回填系统默认值。
   *
   * 不做状态同步：`form.llmModelSpec` 只装用户的选择，提交与渲染都用「用户选过就用它，
   * 否则用默认」的派生值——配置查询比弹窗晚到、或用户中途改选，都不需要 effect 去补。
   */
  const systemConfig = useSystemConfig();
  const rawDefaultModel = systemConfig.config?.values.default_model;
  const defaultModel =
    typeof rawDefaultModel === 'string' ? rawDefaultModel : '';
  const modelSpec = form.llmModelSpec || defaultModel;
  const formWithModel = { ...form, llmModelSpec: modelSpec };

  const modelGroups = Object.values(models.data ?? {});
  const setField = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) => {
    setError('');
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async () => {
    const input = { ...formWithModel, graphIndexedChunks: indexedChunks };
    const invalid = validateGenerateForm(input);
    if (invalid) {
      setError(invalid);
      return;
    }
    try {
      await generate.mutateAsync(
        buildGeneratePayload({
          ...formWithModel,
          graphIndexedChunks: indexedChunks,
        }),
      );
      onGenerated?.();
      onOpenChange(false);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : '生成失败。',
      );
    }
  };

  return (
    <Modal
      open
      onCancel={() => onOpenChange(false)}
      footer={null}
      title={
        <div>
          <div>自动生成评估基准</div>
          <div className="text-xs font-normal text-color-text-3">
            从当前知识库的 chunk
            里生成评估问题；生成是后台任务，提交后可在列表里看进度。
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 text-xs text-color-text-2">
          <label htmlFor="generate-name">
            名称<span className="text-danger-6"> *</span>
          </label>
          <Input
            id="generate-name"
            value={form.name}
            onChange={(event) => setField('name', event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1 text-xs text-color-text-2">
          <label htmlFor="generate-description">说明</label>
          <textarea
            id="generate-description"
            rows={3}
            className="rounded border border-color-border-1 bg-color-bg-1 px-2 py-1 text-sm text-color-text-1"
            value={form.description}
            onChange={(event) => setField('description', event.target.value)}
          />
        </div>

        <fieldset className="flex gap-2">
          <legend className="sr-only">生成方式</legend>
          {MODES.map((mode) => {
            const disabled =
              mode.value === 'graph_enhanced' && indexedChunks <= 0;
            const selected = form.generationMode === mode.value;
            const Icon = mode.value === 'vector' ? Boxes : GitBranch;
            return (
              <label
                key={mode.value}
                className={`flex flex-1 flex-col gap-1 rounded border px-3 py-2 text-xs ${
                  selected
                    ? 'border-primary-6 bg-primary-1'
                    : 'border-color-border-1'
                } ${disabled ? 'opacity-60' : ''}`}
              >
                <span className="flex items-center gap-2 text-sm text-color-text-1">
                  <input
                    type="radio"
                    name="generation-mode"
                    value={mode.value}
                    checked={selected}
                    disabled={disabled}
                    onChange={() => setField('generationMode', mode.value)}
                  />
                  <Icon className="size-4" />
                  {mode.label}
                  <span className="rounded bg-color-fill-2 px-1 text-color-text-3">
                    {mode.tag}
                  </span>
                </span>
                <span className="text-color-text-3">{mode.description}</span>
                {mode.value === 'graph_enhanced' ? (
                  <span className="text-color-text-3">
                    {disabled
                      ? '当前知识库尚未完成图谱构建，暂不能使用图增强构建。'
                      : `已构建图谱的 chunks：${indexedChunks}`}
                  </span>
                ) : (
                  <span className="text-color-text-3">
                    适合快速生成通用评估基准。
                  </span>
                )}
              </label>
            );
          })}
        </fieldset>

        <div className="flex flex-col gap-1 text-xs text-color-text-2">
          <label htmlFor="generate-model">
            LLM 模型<span className="text-danger-6"> *</span>
          </label>
          <Select
            value={modelSpec}
            onChange={(value) => setField('llmModelSpec', value)}
            id="generate-model"
            aria-label="LLM 模型"
            placeholder={
              models.isLoading
                ? '正在加载模型…'
                : models.isError
                  ? '模型列表加载失败'
                  : '选择生成模型'
            }
            virtual={false}
            options={modelGroups.flatMap((group) =>
              group.models.map((model) => ({
                value: model.spec,
                label: `${group.provider_display_name} · ${model.display_name || model.model_id}`,
              })),
            )}
          />
          {models.isError ? (
            <span className="text-danger-6">
              模型列表加载失败，先确认模型供应商可用再生成。
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1 text-xs text-color-text-2">
            <label htmlFor="generate-count">题目数量</label>
            <Input
              id="generate-count"
              type="number"
              min={GENERATE_LIMITS.count.min}
              max={GENERATE_LIMITS.count.max}
              value={form.count}
              onChange={(event) =>
                setField('count', Number(event.target.value))
              }
            />
          </div>
          <div className="flex flex-col gap-1 text-xs text-color-text-2">
            <label htmlFor="generate-neighbors">参考 Chunk 数</label>
            <Input
              id="generate-neighbors"
              type="number"
              min={GENERATE_LIMITS.neighbors.min}
              max={GENERATE_LIMITS.neighbors.max}
              value={form.neighborsCount}
              onChange={(event) =>
                setField('neighborsCount', Number(event.target.value))
              }
            />
          </div>
          <div className="flex flex-col gap-1 text-xs text-color-text-2">
            <label htmlFor="generate-concurrency">并发数</label>
            <Input
              id="generate-concurrency"
              type="number"
              min={GENERATE_LIMITS.concurrency.min}
              max={GENERATE_LIMITS.concurrency.max}
              value={form.concurrencyCount}
              onChange={(event) =>
                setField('concurrencyCount', Number(event.target.value))
              }
            />
          </div>
          {form.generationMode === 'graph_enhanced' ? (
            <div className="flex flex-col gap-1 text-xs text-color-text-2">
              <label htmlFor="generate-expand">图谱扩散数</label>
              <Input
                id="generate-expand"
                type="number"
                min={GENERATE_LIMITS.graphExpandTopK.min}
                max={GENERATE_LIMITS.graphExpandTopK.max}
                value={form.graphExpandTopK}
                onChange={(event) =>
                  setField('graphExpandTopK', Number(event.target.value))
                }
              />
            </div>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="text-xs text-danger-6">
            {error}
          </p>
        ) : null}
      </div>
      <div>
        <Button
          htmlType="button"
          variant="outlined"
          disabled={generate.isPending}
          onClick={() => onOpenChange(false)}
        >
          取消
        </Button>
        <Button
          htmlType="button"
          disabled={generate.isPending}
          onClick={() => void submit()}
        >
          {generate.isPending ? <Spin /> : <Sparkles className="size-4" />}
          生成
        </Button>
      </div>
    </Modal>
  );
};
