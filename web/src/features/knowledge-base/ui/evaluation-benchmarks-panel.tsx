/**
 * 评估基准分区：数据集列表、生成进度、预览、继续生成、下载与删除。
 *
 * 空态给「上传基准 / 自动生成」两个入口，列表项展示名称、说明、类型与来源标签、创建时间与
 * 题目数；生成中的行显示进度并自带 3 秒轮询（`useEvaluationDatasets` 在有待生成行时才轮询）。
 * 操作菜单按状态给「继续生成 / 下载 / 删除」，生成中先拦下不弹确认；「继续生成」只对 failed
 * 出现，提交后按后端返回的消息提示（后端对「已完成」「已有进行中任务」都回消息而不是报错）。
 */
import * as React from 'react';
import {
  Download,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button, Dropdown, Spin } from 'antd';
import { Progress } from '@/shared/ui/progress';
import { useNotifications } from '@/shared/ui/notifications';
import { useConfirm } from '@/shared/ui/confirm-dialog';

import type { EvaluationDataset } from '../api/evaluation-api';
import {
  canPreviewDataset,
  datasetKindLabel,
  datasetProgress,
  datasetSourceLabel,
  datasetStatusMessage,
  datasetStatusView,
  isDatasetCompleted,
  isDatasetGenerating,
} from '../lib/evaluation-view';
import { formatFileTableTime } from '../lib/knowledge-files';
import { triggerBlobDownload } from '../lib/file-download';
import {
  useDeleteEvaluationDataset,
  useEvaluationDatasets,
  useResumeEvaluationDataset,
} from '../model/evaluation-queries';
import { evaluationApi } from '../api/evaluation-api';
import { BenchmarkGenerateDialog } from './benchmark-generate-dialog';
import { BenchmarkUploadDialog } from './benchmark-upload-dialog';
import { BenchmarkDatasetPreview } from './benchmark-dataset-preview';
import { Empty } from '@/shared/ui/empty';

export type EvaluationBenchmarksPanelProps = {
  kbId: string;
  readOnly: boolean;
};

const Tag = ({
  children,
  className = 'bg-color-fill-2 text-color-text-2',
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <span className={`rounded px-1.5 py-0.5 text-xs ${className}`}>
    {children}
  </span>
);

export const EvaluationBenchmarksPanel = ({
  kbId,
  readOnly,
}: EvaluationBenchmarksPanelProps) => {
  const { confirm } = useConfirm();
  const notifications = useNotifications();
  const datasets = useEvaluationDatasets(kbId);
  const resume = useResumeEvaluationDataset(kbId);
  const remove = useDeleteEvaluationDataset(kbId);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [generateOpen, setGenerateOpen] = React.useState(false);
  const [previewId, setPreviewId] = React.useState<string | null>(null);

  const notify = (type: 'success' | 'error', message: string) =>
    notifications.addNotification({ type, title: '评估基准', message });

  const runResume = async (dataset: EvaluationDataset) => {
    try {
      const result = await resume.mutateAsync(dataset.dataset_id);
      notify('success', result.message || '已恢复生成。');
    } catch (error) {
      notify(
        'error',
        error instanceof Error ? error.message : '恢复生成失败。',
      );
    }
  };

  const runDownload = async (dataset: EvaluationDataset) => {
    try {
      const { blob, filename } = await evaluationApi.downloadDataset(
        dataset.dataset_id,
      );
      triggerBlobDownload(
        blob,
        filename ?? `${dataset.name || dataset.dataset_id}.jsonl`,
      );
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '下载失败。');
    }
  };

  const runDelete = async (dataset: EvaluationDataset) => {
    if (isDatasetGenerating(dataset.build_metadata)) {
      notify('error', '评估基准生成中，暂不能删除。');
      return;
    }
    const confirmed = await confirm({
      title: '确认删除',
      description: `确定要删除评估基准「${dataset.name}」吗？此操作不可恢复。`,
      confirmText: '确定',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await remove.mutateAsync(dataset.dataset_id);
      notify('success', '删除成功。');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '删除失败。');
    }
  };

  if (datasets.isLoading) {
    return (
      <div className="flex h-[420px] items-center justify-center gap-2 text-sm text-color-text-2">
        <Spin />
        加载中…
      </div>
    );
  }

  if (datasets.isError) {
    return (
      <div className="flex h-[420px] flex-col items-center justify-center gap-3">
        <p role="alert" className="text-sm text-danger-6">
          加载评估基准失败：
          {datasets.error instanceof Error
            ? datasets.error.message
            : '未知错误'}
        </p>
        <Button
          htmlType="button"
          variant="outlined"
          onClick={() => void datasets.refetch()}
        >
          <RefreshCw className="size-4" />
          重试
        </Button>
      </div>
    );
  }

  const rows = datasets.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-color-text-2">
          共 {rows.length} 个评估基准
        </span>
        <div className="flex gap-2">
          <Button
            htmlType="button"
            variant="outlined"
            onClick={() => void datasets.refetch()}
          >
            <RefreshCw className="size-4" />
            刷新
          </Button>
          {readOnly ? null : (
            <>
              <Button
                htmlType="button"
                variant="outlined"
                onClick={() => setUploadOpen(true)}
              >
                <Upload className="size-4" />
                上传基准
              </Button>
              <Button htmlType="button" onClick={() => setGenerateOpen(true)}>
                <Sparkles className="size-4" />
                自动生成
              </Button>
            </>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex h-[380px] flex-col items-center justify-center gap-1 rounded-large border border-color-border-1">
          <p className="text-sm font-medium text-color-text-1">暂无评估基准</p>
          <Empty
            description={
              readOnly
                ? '还没有评估基准，请等待知识库管理员上传或生成。'
                : '上传数据集，或从当前知识库自动生成评估问题。'
            }
            action={
              readOnly ? null : (
                <div className="flex gap-2">
                  <Button
                    htmlType="button"
                    variant="outlined"
                    onClick={() => setUploadOpen(true)}
                  >
                    <Upload className="size-4" />
                    上传基准
                  </Button>
                  <Button
                    htmlType="button"
                    onClick={() => setGenerateOpen(true)}
                  >
                    <Sparkles className="size-4" />
                    自动生成
                  </Button>
                </div>
              )
            }
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((dataset) => {
            const status = datasetStatusView(dataset.build_metadata);
            const progress = datasetProgress(dataset.build_metadata);
            const generating = isDatasetGenerating(dataset.build_metadata);
            return (
              <li
                key={dataset.dataset_id}
                className="flex flex-col gap-2 rounded-large border border-color-border-1 px-3 py-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      className="text-left text-sm font-medium text-color-text-1 disabled:opacity-60"
                      disabled={!canPreviewDataset(dataset.build_metadata)}
                      onClick={() => setPreviewId(dataset.dataset_id)}
                    >
                      {dataset.name}
                    </button>
                    <span className="text-xs text-color-text-3">
                      {dataset.description || '暂无描述'}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      <Tag>{datasetKindLabel(dataset)}</Tag>
                      <Tag>{datasetSourceLabel(dataset.build_metadata)}</Tag>
                      {/* 完成态不用再标一次；未完成与失败都要能一眼看出来 */}
                      {dataset.build_metadata.status &&
                      dataset.build_metadata.status !== 'completed' ? (
                        <Tag className={status.className}>{status.label}</Tag>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-color-text-3">
                      {formatFileTableTime(dataset.created_at)} ·{' '}
                      {dataset.item_count} 个问题
                    </span>
                    {readOnly ? null : (
                      <Dropdown
                        trigger={['click']}
                        menu={{
                          items: [
                            {
                              key: 'resume',
                              label: (
                                <span className="flex items-center gap-2">
                                  <Plus className="size-4" />
                                  继续生成
                                </span>
                              ),
                              disabled:
                                dataset.build_metadata.status !== 'failed',
                            },
                            {
                              key: 'download',
                              label: (
                                <span className="flex items-center gap-2">
                                  <Download className="size-4" />
                                  下载
                                </span>
                              ),
                              disabled: !isDatasetCompleted(
                                dataset.build_metadata,
                              ),
                            },
                            {
                              key: 'delete',
                              label: (
                                <span className="flex items-center gap-2">
                                  <Trash2 className="size-4" />
                                  删除
                                </span>
                              ),
                            },
                          ],
                          onClick: ({ key }) => {
                            if (key === 'resume') void runResume(dataset);
                            if (key === 'download') void runDownload(dataset);
                            if (key === 'delete') void runDelete(dataset);
                          },
                        }}
                      >
                        <Button
                          htmlType="button"
                          type="text"
                          size="small"
                          aria-label={`${dataset.name} 操作`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </Dropdown>
                    )}
                  </div>
                </div>

                {progress !== null ? (
                  <Progress
                    value={progress}
                    label={datasetStatusMessage(dataset.build_metadata)}
                  />
                ) : null}
                {generating && progress === null ? (
                  <span className="text-xs text-color-text-3">
                    {datasetStatusMessage(dataset.build_metadata)}
                  </span>
                ) : null}
                {dataset.build_metadata.status === 'failed' ? (
                  <span className="text-xs text-danger-6">
                    {datasetStatusMessage(dataset.build_metadata)}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {uploadOpen ? (
        <BenchmarkUploadDialog
          kbId={kbId}
          onOpenChange={setUploadOpen}
          onUploaded={() => notify('success', '基准上传成功。')}
        />
      ) : null}
      {generateOpen ? (
        <BenchmarkGenerateDialog
          kbId={kbId}
          onOpenChange={setGenerateOpen}
          onGenerated={() => notify('success', '生成任务已提交。')}
        />
      ) : null}
      {previewId ? (
        <BenchmarkDatasetPreview
          kbId={kbId}
          datasetId={previewId}
          onOpenChange={(open) => setPreviewId(open ? previewId : null)}
          onDownload={(dataset) => void runDownload(dataset)}
        />
      ) : null}
    </div>
  );
};
