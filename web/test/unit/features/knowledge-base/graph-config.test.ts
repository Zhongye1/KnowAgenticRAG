/**
 * 抽取配置纯逻辑：默认值/回填、模型参数 JSON、提交体组装与提交前校验。
 */
import { describe, expect, it } from 'vitest';

import type { GraphBuildConfig } from '@/features/knowledge-base/api/graph-api';
import {
  buildExtractorOptions,
  DEFAULT_GRAPH_CONFIG_FORM,
  fillGraphConfigForm,
  parseModelParams,
  validateGraphConfig,
} from '@/features/knowledge-base/lib/graph-config';

describe('表单回填', () => {
  it('没有配置时给默认值：LLM、并发 50、其余为空', () => {
    expect(fillGraphConfigForm(null)).toEqual(DEFAULT_GRAPH_CONFIG_FORM);
  });

  it('有锁定配置时回填模型、Schema、并发与参数', () => {
    const config: GraphBuildConfig = {
      locked: true,
      extractor_type: 'llm',
      extractor_options: {
        model_spec: 'openai/gpt-4o',
        schema: '实体：Person',
        concurrency_count: 8,
        model_params: { temperature: 0.1 },
      },
    };

    expect(fillGraphConfigForm(config)).toEqual({
      extractorType: 'llm',
      modelSpec: 'openai/gpt-4o',
      schema: '实体：Person',
      concurrencyCount: 8,
      modelParamsText: '{"temperature":0.1}',
    });
  });

  it('并发数缺失或为 0 时回到默认 50', () => {
    expect(
      fillGraphConfigForm({
        locked: true,
        extractor_options: { concurrency_count: 0 },
      }).concurrencyCount,
    ).toBe(50);
  });
});

describe('模型参数 JSON', () => {
  it('空文本视为没有参数', () => {
    expect(parseModelParams('   ')).toEqual({ ok: true, value: {} });
  });

  it('合法对象解析成功', () => {
    expect(parseModelParams('{"temperature":0.1}')).toEqual({
      ok: true,
      value: { temperature: 0.1 },
    });
  });

  it('非法 JSON 与「不是对象」分别给出各自的说明', () => {
    expect(parseModelParams('{')).toEqual({
      ok: false,
      message: '模型参数必须是合法 JSON 对象。',
    });
    expect(parseModelParams('[1,2]')).toEqual({
      ok: false,
      message: '模型参数必须是 JSON 对象。',
    });
    expect(parseModelParams('12')).toEqual({
      ok: false,
      message: '模型参数必须是 JSON 对象。',
    });
  });
});

describe('提交前校验', () => {
  const valid = {
    ...DEFAULT_GRAPH_CONFIG_FORM,
    modelSpec: 'openai/gpt-4o',
  };

  it('合法配置没有报错', () => {
    expect(validateGraphConfig(valid)).toBeNull();
  });

  it('模型必填：上游会把空模型交给后端换回 400，这里先拦', () => {
    expect(validateGraphConfig({ ...valid, modelSpec: '  ' })).toBe(
      '请选择抽取模型。',
    );
  });

  it('并发数越界与非法值都拦下', () => {
    expect(validateGraphConfig({ ...valid, concurrencyCount: 0 })).toContain(
      '1 到 1000',
    );
    expect(validateGraphConfig({ ...valid, concurrencyCount: 1001 })).toContain(
      '1 到 1000',
    );
    expect(
      validateGraphConfig({ ...valid, concurrencyCount: Number.NaN }),
    ).toBe('并发数必须是数字。');
  });

  it('模型参数不合法时给出同一条说明', () => {
    expect(validateGraphConfig({ ...valid, modelParamsText: 'not-json' })).toBe(
      '模型参数必须是合法 JSON 对象。',
    );
  });
});

describe('提交体组装', () => {
  it('模型与 Schema 去空白，空参数给空对象', () => {
    expect(
      buildExtractorOptions({
        extractorType: 'llm',
        modelSpec: ' openai/gpt-4o ',
        schema: '  实体：Person  ',
        concurrencyCount: 8,
        modelParamsText: '',
      }),
    ).toEqual({
      model_spec: 'openai/gpt-4o',
      schema: '实体：Person',
      concurrency_count: 8,
      model_params: {},
    });
  });

  it('参数文本可解析时带上解析结果（不再包一层字符串）', () => {
    expect(
      buildExtractorOptions({
        ...DEFAULT_GRAPH_CONFIG_FORM,
        modelSpec: 'm',
        modelParamsText: '{"temperature":0.1}',
      }).model_params,
    ).toEqual({ temperature: 0.1 });
  });

  it('并发数为 0 时用默认 50（上游同）', () => {
    expect(
      buildExtractorOptions({
        ...DEFAULT_GRAPH_CONFIG_FORM,
        modelSpec: 'm',
        concurrencyCount: 0,
      }).concurrency_count,
    ).toBe(50);
  });
});
