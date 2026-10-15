/**
 * 评估表单的纯逻辑：默认名、字段校验、JSONL 校验与启动提示。
 *
 * 约束与后端 schema（`knowledge_eval_router.py` 的 `GenerateDatasetRequest`）逐条对齐，
 * 并发上限用后端的 20。
 */

/** 上传文件的体积上限。 */
export const MAX_BENCHMARK_FILE_BYTES = 100 * 1024 * 1024;

/** 上传校验时只解析前几行，避免大文件在浏览器里整份 parse。 */
export const JSONL_SAMPLE_LINES = 5;

export const GENERATE_LIMITS = {
  count: { min: 1, max: 100, default: 10 },
  neighbors: { min: 0, max: 10, default: 1 },
  concurrency: { min: 1, max: 20, default: 10 },
  graphExpandTopK: { min: 1, max: 3, default: 1 },
} as const;

const two = (value: number) => String(value).padStart(2, '0');

/** 自动生成的基准名：`Test-YYYY-MM-DD-xxxx`（4 位 36 进制随机）。 */
export const buildDefaultBenchmarkName = (now = new Date()): string => {
  const suffix = Math.random().toString(36).slice(2, 6);
  return `Test-${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}-${suffix}`;
};

/** 评估运行名：`eval-YYYYMMDD-xxxxxx`（6 位十六进制）。 */
export const buildDefaultEvaluationName = (now = new Date()): string => {
  const suffix = Math.random().toString(16).slice(2, 8).padEnd(6, '0');
  return `eval-${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}-${suffix}`;
};

/** 基准名称：2..100。 */
export const validateBenchmarkName = (name: string): string | null => {
  const trimmed = name.trim();
  if (!trimmed) return '请输入基准名称。';
  if (trimmed.length < 2 || trimmed.length > 100) {
    return '基准名称长度应在 2-100 个字符之间。';
  }
  return null;
};

/** 上传文件：扩展名与体积。 */
export const validateBenchmarkFile = (
  file: Pick<File, 'name' | 'size'> | null | undefined,
): string | null => {
  if (!file) return '请选择基准文件。';
  if (!file.name.toLowerCase().endsWith('.jsonl')) {
    return '仅支持 JSONL 格式文件。';
  }
  if (file.size / 1024 / 1024 >= 100) {
    return '文件大小不能超过 100MB。';
  }
  return null;
};

/**
 * JSONL 内容：至少一行非空，且前 `JSONL_SAMPLE_LINES` 行都能解析成 JSON 对象。
 *
 * 判空按「有没有非空行」而不是 trim 后的长度；只抽样前 5 行，且要求抽样行是对象
 * （数组或原始值不是合法的评估条目）；错误文案统一成一句并标出首个坏行的行号。
 */
export const validateJsonlContent = (content: string): string | null => {
  const lines = content
    .split('\n')
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter((item) => item.line.length > 0);
  if (lines.length === 0) return '文件内容为空，请检查 JSONL 格式。';

  for (const item of lines.slice(0, JSONL_SAMPLE_LINES)) {
    try {
      const parsed: unknown = JSON.parse(item.line);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return `第 ${item.number} 行不是 JSON 对象。`;
      }
    } catch {
      return `文件格式错误，请检查 JSONL 格式（第 ${item.number} 行解析失败）。`;
    }
  }
  return null;
};

export type EvaluationStartInput = {
  datasetId: string;
  name: string;
  hasGoldAnswers: boolean;
  answerLlm: string;
  judgeLlm: string;
};

/** 启动评估前的校验：基准必选、名称非空、两个模型必须同时给或同时不给。 */
export const validateEvaluationStart = (
  input: EvaluationStartInput,
): string | null => {
  if (!input.datasetId) return '请先选择评估基准。';
  if (!input.name.trim()) return '请输入评估名称。';
  const hasAnswer = Boolean(input.answerLlm.trim());
  const hasJudge = Boolean(input.judgeLlm.trim());
  if (hasAnswer !== hasJudge) {
    return '生成模型和评估模型必须同时选择或者同时不选择。';
  }
  if (!input.hasGoldAnswers && (hasAnswer || hasJudge)) {
    return '当前基准没有标准答案，不需要选择模型。';
  }
  return null;
};

/** 启动前的提示语：会不会跑答案评估，取决于基准与模型选择。 */
export const evaluationStartHint = (
  input: Pick<
    EvaluationStartInput,
    'hasGoldAnswers' | 'answerLlm' | 'judgeLlm'
  >,
): string => {
  if (!input.hasGoldAnswers) return '当前基准只会执行检索评估，无需选择模型。';
  const hasAnswer = Boolean(input.answerLlm.trim());
  const hasJudge = Boolean(input.judgeLlm.trim());
  if (!hasAnswer && !hasJudge) return '不选择模型时，将仅执行检索评估。';
  if (hasAnswer !== hasJudge) {
    return '答案生成模型和答案评判模型需要同时选择。';
  }
  return '将执行检索评估与答案评估。';
};

export type GenerateFormInput = {
  name: string;
  count: number;
  neighborsCount: number;
  concurrencyCount: number;
  llmModelSpec: string;
  generationMode: 'vector' | 'graph_enhanced';
  graphExpandTopK: number;
  /** 图谱已构建的 chunk 数；为 0 时不能用图增强。 */
  graphIndexedChunks: number;
};

/** 生成数据集的提交前校验；数值边界与后端 schema 一致。 */
export const validateGenerateForm = (
  input: GenerateFormInput,
): string | null => {
  const nameError = validateBenchmarkName(input.name);
  if (nameError) return nameError;
  if (!input.llmModelSpec.trim()) return '请选择 LLM 模型。';
  if (
    input.count < GENERATE_LIMITS.count.min ||
    input.count > GENERATE_LIMITS.count.max
  ) {
    return `题目数量需要在 ${GENERATE_LIMITS.count.min} 到 ${GENERATE_LIMITS.count.max} 之间。`;
  }
  if (
    input.neighborsCount < GENERATE_LIMITS.neighbors.min ||
    input.neighborsCount > GENERATE_LIMITS.neighbors.max
  ) {
    return `参考 Chunk 数需要在 ${GENERATE_LIMITS.neighbors.min} 到 ${GENERATE_LIMITS.neighbors.max} 之间。`;
  }
  if (
    input.concurrencyCount < GENERATE_LIMITS.concurrency.min ||
    input.concurrencyCount > GENERATE_LIMITS.concurrency.max
  ) {
    return `并发数需要在 ${GENERATE_LIMITS.concurrency.min} 到 ${GENERATE_LIMITS.concurrency.max} 之间。`;
  }
  if (input.generationMode === 'graph_enhanced') {
    if (input.graphIndexedChunks <= 0) {
      return '当前知识库尚未完成图谱构建，暂不能使用图增强构建。';
    }
    if (
      input.graphExpandTopK < GENERATE_LIMITS.graphExpandTopK.min ||
      input.graphExpandTopK > GENERATE_LIMITS.graphExpandTopK.max
    ) {
      return `图谱扩散数需要在 ${GENERATE_LIMITS.graphExpandTopK.min} 到 ${GENERATE_LIMITS.graphExpandTopK.max} 之间。`;
    }
  }
  return null;
};

/** 组装生成请求体（字段名照后端 schema）。 */
export const buildGeneratePayload = (
  input: GenerateFormInput & { description: string },
) => ({
  name: input.name.trim(),
  description: input.description.trim(),
  count: input.count,
  neighbors_count: input.neighborsCount,
  concurrency_count: input.concurrencyCount,
  llm_model_spec: input.llmModelSpec.trim(),
  generation_mode: input.generationMode,
  graph_expand_top_k: input.graphExpandTopK,
});
