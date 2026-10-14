/**
 * 上传评估基准弹窗。
 *
 * 名称（必填 2-100）、说明、`.jsonl` 文件（≤100MB、抽样前 5 行必须是 JSON 对象）。校验在
 * 提交前做，错误显示在弹窗里；后端只会校验扩展名，体积与内容格式是界面自己的约束。
 */
import * as React from 'react';
import { Button, Input, Modal, Spin } from 'antd';

import {
  MAX_BENCHMARK_FILE_BYTES,
  validateBenchmarkFile,
  validateBenchmarkName,
  validateJsonlContent,
} from '../lib/evaluation-form';
import { useUploadEvaluationDataset } from '../model/evaluation-queries';

export type BenchmarkUploadDialogProps = {
  kbId: string;
  onOpenChange: (open: boolean) => void;
  /** 上传成功后回调（关闭弹窗的原因可能是取消，不能拿它当成功信号）。 */
  onUploaded?: () => void;
};

export const BenchmarkUploadDialog = ({
  kbId,
  onOpenChange,
  onUploaded,
}: BenchmarkUploadDialogProps) => {
  const upload = useUploadEvaluationDataset(kbId);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState('');

  const pickFile = async (picked: File | null) => {
    setFile(picked);
    setError('');
    if (!picked) return;
    const fileError = validateBenchmarkFile(picked);
    if (fileError) {
      setError(fileError);
      setFile(null);
      return;
    }
    const content = await picked.text().catch(() => null);
    if (content === null) {
      setError('文件读取失败。');
      setFile(null);
      return;
    }
    const contentError = validateJsonlContent(content);
    if (contentError) {
      setError(contentError);
      setFile(null);
    }
  };

  const submit = async () => {
    const nameError = validateBenchmarkName(name);
    if (nameError) {
      setError(nameError);
      return;
    }
    const fileError = validateBenchmarkFile(file);
    if (fileError) {
      setError(fileError);
      return;
    }
    setError('');
    try {
      await upload.mutateAsync({
        file: file as File,
        name: name.trim(),
        description: description.trim(),
      });
      onUploaded?.();
      onOpenChange(false);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : '上传失败。',
      );
    }
  };

  return (
    <Modal open onCancel={() => onOpenChange(false)} footer={null}>
      title=
      {
        <div>
          <div>上传评估基准</div>
          <div className="text-xs font-normal text-color-text-3">
            每行一个 JSON 对象，仅支持 .jsonl，最大 100MB。
          </div>
        </div>
      }
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 text-xs text-color-text-2">
          <label htmlFor="benchmark-name">
            名称<span className="text-danger-6"> *</span>
          </label>
          <Input
            id="benchmark-name"
            value={name}
            onChange={(event) => {
              setError('');
              setName(event.target.value);
            }}
          />
        </div>

        <div className="flex flex-col gap-1 text-xs text-color-text-2">
          <label htmlFor="benchmark-description">说明</label>
          <textarea
            id="benchmark-description"
            rows={3}
            className="rounded border border-color-border-1 bg-color-bg-1 px-2 py-1 text-sm text-color-text-1"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1 text-xs text-color-text-2">
          <label htmlFor="benchmark-file">
            基准文件<span className="text-danger-6"> *</span>
          </label>
          <input
            id="benchmark-file"
            type="file"
            accept=".jsonl"
            className="text-sm text-color-text-1"
            onChange={(event) => void pickFile(event.target.files?.[0] ?? null)}
          />
          <span className="text-color-text-3">
            上限 {Math.round(MAX_BENCHMARK_FILE_BYTES / 1024 / 1024)}
            MB，抽样校验前 5 行。
          </span>
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
          disabled={upload.isPending}
          onClick={() => onOpenChange(false)}
        >
          取消
        </Button>
        <Button
          htmlType="button"
          disabled={upload.isPending}
          onClick={() => void submit()}
        >
          {upload.isPending ? <Spin /> : null}
          上传
        </Button>
      </div>
    </Modal>
  );
};
