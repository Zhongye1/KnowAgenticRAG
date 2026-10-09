/**
 * 评估表单纯逻辑：默认名、名称/文件/JSONL 校验、启动评估与生成数据集的提交前校验。
 */
import { describe, expect, it } from 'vitest';

import {
  buildDefaultBenchmarkName,
  buildDefaultEvaluationName,
  GENERATE_LIMITS,
  validateBenchmarkFile,
  validateBenchmarkName,
  validateEvaluationStart,
  validateGenerateForm,
  validateJsonlContent,
} from '@/features/knowledge-base/lib/evaluation-form';

describe('默认名称', () => {
  it('基准名带日期与 4 位随机后缀', () => {
    const name = buildDefaultBenchmarkName(new Date(2026, 9, 9));

    expect(name).toMatch(/^Test-2026-10-09-[0-9a-z]{4}$/);
  });

  it('评估名带日期与 6 位十六进制后缀', () => {
    const name = buildDefaultEvaluationName(new Date(2026, 9, 9));

    expect(name).toMatch(/^eval-20261009-[0-9a-f]{6}$/);
  });
});

describe('名称校验', () => {
  it('空、过短、过长都拦下，两边空白不算长度', () => {
    expect(validateBenchmarkName('')).toBe('请输入基准名称。');
    expect(validateBenchmarkName('  ')).toBe('请输入基准名称。');
    expect(validateBenchmarkName('a')).toContain('2-100');
    expect(validateBenchmarkName('a'.repeat(101))).toContain('2-100');
    expect(validateBenchmarkName(' 基准 ')).toBeNull();
    expect(validateBenchmarkName('ab')).toBeNull();
    expect(validateBenchmarkName('a'.repeat(100))).toBeNull();
  });
});

describe('上传文件校验', () => {
  it('只收 .jsonl，后缀大小写不敏感', () => {
    expect(validateBenchmarkFile({ name: 'a.json', size: 10 })).toBe(
      '仅支持 JSONL 格式文件。',
    );
    expect(validateBenchmarkFile({ name: 'a.JSONL', size: 10 })).toBeNull();
    expect(validateBenchmarkFile(null)).toBe('请选择基准文件。');
  });

  it('100MB 及以上拦下（上游口径）', () => {
    expect(
      validateBenchmarkFile({ name: 'a.jsonl', size: 100 * 1024 * 1024 }),
    ).toBe('文件大小不能超过 100MB。');
    expect(
      validateBenchmarkFile({ name: 'a.jsonl', size: 100 * 1024 * 1024 - 1 }),
    ).toBeNull();
  });
});

describe('JSONL 内容校验', () => {
  it('空文件与只有空行的文件都拦下（上游这里拦不住）', () => {
    expect(validateJsonlContent('')).toBe('文件内容为空，请检查 JSONL 格式。');
    expect(validateJsonlContent('\n  \n')).toBe(
      '文件内容为空，请检查 JSONL 格式。',
    );
  });

  it('抽样行能解析成对象就通过，行号按原文计', () => {
    const content = ['{"query":"a"}', '', '{"query":"b"}'].join('\n');

    expect(validateJsonlContent(content)).toBeNull();
  });

  it('解析失败给出带行号的说明', () => {
    expect(validateJsonlContent('{"query":"a"}\nnot-json')).toBe(
      '文件格式错误，请检查 JSONL 格式（第 2 行解析失败）。',
    );
  });

  it('不是对象的行（数组/原始值）单独拦下', () => {
    expect(validateJsonlContent('[1,2]')).toBe('第 1 行不是 JSON 对象。');
    expect(validateJsonlContent('42')).toBe('第 1 行不是 JSON 对象。');
  });

  it('只抽样前 5 行：第 6 行坏也放行（上游同）', () => {
    const content = Array.from({ length: 5 }, () => '{"q":1}')
      .concat('broken')
      .join('\n');

    expect(validateJsonlContent(content)).toBeNull();
  });
});

describe('启动评估校验', () => {
  const base = {
    datasetId: 'ds-1',
    name: 'eval-1',
    hasGoldAnswers: true,
    answerLlm: '',
    judgeLlm: '',
  };

  it('基准与名称必填', () => {
    expect(validateEvaluationStart({ ...base, datasetId: '' })).toBe(
      '请先选择评估基准。',
    );
    expect(validateEvaluationStart({ ...base, name: '  ' })).toBe(
      '请输入评估名称。',
    );
  });

  it('两个模型必须同时选或同时不选', () => {
    expect(
      validateEvaluationStart({ ...base, answerLlm: 'a', judgeLlm: '' }),
    ).toBe('生成模型和评估模型必须同时选择或者同时不选择。');
    expect(
      validateEvaluationStart({ ...base, answerLlm: '', judgeLlm: 'b' }),
    ).toBe('生成模型和评估模型必须同时选择或者同时不选择。');
    expect(
      validateEvaluationStart({ ...base, answerLlm: 'a', judgeLlm: 'b' }),
    ).toBeNull();
    expect(validateEvaluationStart(base)).toBeNull();
  });

  it('没有标准答案的基准不许选模型', () => {
    expect(
      validateEvaluationStart({
        ...base,
        hasGoldAnswers: false,
        answerLlm: 'a',
        judgeLlm: 'b',
      }),
    ).toBe('当前基准没有标准答案，不需要选择模型。');
  });
});

describe('生成数据集校验', () => {
  const base = {
    name: 'Test-1',
    count: GENERATE_LIMITS.count.default,
    neighborsCount: GENERATE_LIMITS.neighbors.default,
    concurrencyCount: GENERATE_LIMITS.concurrency.default,
    llmModelSpec: 'openai/gpt-4o',
    generationMode: 'vector' as const,
    graphExpandTopK: GENERATE_LIMITS.graphExpandTopK.default,
    graphIndexedChunks: 0,
  };

  it('合法表单没有报错', () => {
    expect(validateGenerateForm(base)).toBeNull();
  });

  it('模型必填（上游会交给后端 422）', () => {
    expect(validateGenerateForm({ ...base, llmModelSpec: ' ' })).toBe(
      '请选择 LLM 模型。',
    );
  });

  it('数值边界与后端 schema 一致', () => {
    expect(validateGenerateForm({ ...base, count: 0 })).toContain('题目数量');
    expect(validateGenerateForm({ ...base, count: 101 })).toContain('题目数量');
    expect(validateGenerateForm({ ...base, neighborsCount: 11 })).toContain(
      '参考 Chunk 数',
    );
    expect(validateGenerateForm({ ...base, concurrencyCount: 21 })).toContain(
      '并发数',
    );
    expect(validateGenerateForm({ ...base, concurrencyCount: 0 })).toContain(
      '并发数',
    );
  });

  it('图增强需要已构建的图谱，且扩散数在 1..3', () => {
    expect(
      validateGenerateForm({ ...base, generationMode: 'graph_enhanced' }),
    ).toBe('当前知识库尚未完成图谱构建，暂不能使用图增强构建。');
    expect(
      validateGenerateForm({
        ...base,
        generationMode: 'graph_enhanced',
        graphIndexedChunks: 5,
      }),
    ).toBeNull();
    expect(
      validateGenerateForm({
        ...base,
        generationMode: 'graph_enhanced',
        graphIndexedChunks: 5,
        graphExpandTopK: 4,
      }),
    ).toContain('图谱扩散数');
  });
});
