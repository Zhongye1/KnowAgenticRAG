import { describe, expect, it } from 'vitest';

import {
  getCacheHitLabel,
  getLatestCallLabel,
  getModelUsageItems,
  getThreadTotalLabel,
  getTokenUsageAriaLabel,
  getTokenUsageHeadLabel,
  getTokenUsagePercentLabel,
  getTokenUsageRatio,
  getTokenUsageBarSegments,
  getTokenUsageSegments,
  getTokenUsageTone,
  readTokenUsage,
} from '@/features/chat/lib/token-usage';

const usage = {
  llm_input_tokens: 2048,
  system_tokens: 512,
  tools_tokens: 256,
  tool_count: 3,
  llm_messages_tokens: 1024,
  llm_content_message_tokens: 1024,
  llm_content_message_count: 4,
  llm_tool_message_tokens: 0,
  llm_tool_message_count: 0,
  llm_message_count: 4,
  state_messages_tokens_before_call: 4096,
  state_message_count_before_call: 8,
  summary_active: false,
  summary_message_tokens: 0,
  context_window: 8192,
  summary_trigger_tokens: 4096,
};

describe('用量数字格式化', () => {
  it('缺失值显示占位而不是 0', () => {
    expect(
      getTokenUsageSegments({ system_tokens: 0, llm_input_tokens: null }),
    ).toEqual([]);
    expect(getCacheHitLabel({ thread: { models: { b: {} } } })).toBeNull();
  });

  it('1024 起按 K、按 M 保留三位有效数字，小于 1024 取整', () => {
    expect(getLatestCallLabel({ latest: { usage: { input_tokens: 999 } } })).toBe(
      '输入 999 · 输出 -',
    );
    expect(
      getTokenUsageSegments({ system_tokens: 1536 })[0]?.valueLabel,
    ).toBe('1.5K');
    expect(
      getTokenUsageSegments({ system_tokens: 1024 * 1000 })[0]?.valueLabel,
    ).toBe('1M');
  });

  it('比例取整百分比，夹取发生在上限比值计算里', () => {
    expect(getTokenUsagePercentLabel(0.756)).toBe('76%');
    expect(
      getTokenUsageRatio({ llm_input_tokens: 100, summary_trigger_tokens: 10 }),
    ).toBe(1);
    expect(
      getTokenUsageRatio({ llm_input_tokens: -10, summary_trigger_tokens: 100 }),
    ).toBe(0);
  });

  it('只接受非空对象作为 token_usage', () => {
    expect(readTokenUsage({ token_usage: { a: 1 } })).toEqual({ a: 1 });
    expect(readTokenUsage({ token_usage: [] })).toBeNull();
    expect(readTokenUsage({ token_usage: 'x' })).toBeNull();
    expect(readTokenUsage({ token_usage: null })).toBeNull();
    expect(readTokenUsage(null)).toBeNull();
  });
});

describe('上下文构成', () => {
  it('按上游规则生成分段并过滤零值', () => {
    const segments = getTokenUsageSegments(usage);

    expect(segments.map((segment) => segment.key)).toEqual([
      'system',
      'tools',
      'messages',
      'cut',
      'overhead',
    ]);
    expect(segments.find((segment) => segment.key === 'system')).toMatchObject({
      label: '系统提示',
      valueLabel: '512',
    });
    expect(segments.find((segment) => segment.key === 'tools')?.label).toBe(
      '工具定义 (3)',
    );
  });

  it('被压缩部分来自调用前的 state 与真实输入的差值', () => {
    const cut = getTokenUsageSegments(usage).find(
      (segment) => segment.key === 'cut',
    );

    // 4096 - 1024 = 3072
    expect(cut?.valueLabel).toBe('3K');
    expect(cut?.label).toBe('已压缩 (4)');
  });

  it('摘要生效时单列摘要段并从内容消息里扣掉', () => {
    const segments = getTokenUsageSegments({
      ...usage,
      summary_active: true,
      summary_message_tokens: 512,
      llm_messages_tokens: 1536,
      llm_content_message_tokens: undefined,
      llm_tool_message_tokens: undefined,
    });

    expect(segments.find((segment) => segment.key === 'summary')?.valueLabel).toBe(
      '512',
    );
    expect(segments.find((segment) => segment.key === 'messages')?.valueLabel).toBe(
      '1K',
    );
  });

  it('真实输入大于已归类的部分时补一段「其他」', () => {
    const segments = getTokenUsageSegments({
      llm_input_tokens: 4096,
      system_tokens: 0,
      tools_tokens: 0,
      llm_messages_tokens: 1024,
    });

    expect(segments.find((segment) => segment.key === 'overhead')?.valueLabel).toBe(
      '3K',
    );
  });
});

describe('上下文占比与文案', () => {
  it('上限优先取摘要阈值，其次上下文窗口', () => {
    expect(getTokenUsageHeadLabel(usage)).toBe('2K / 4K');
    expect(
      getTokenUsageHeadLabel({ llm_input_tokens: 1000, context_window: 2000 }),
    ).toBe('1000 / 1.95K');
  });

  it('上限未知时占比为 null，文案显示 --', () => {
    const unknown = { llm_input_tokens: 1000 };

    expect(getTokenUsageRatio(unknown)).toBeNull();
    expect(getTokenUsagePercentLabel(null)).toBe('--');
    expect(getTokenUsageAriaLabel(unknown)).toBe('上下文上限未知，当前估算 1000');
  });

  it('占比按上限夹到 1，档位在 75% 与 90% 处分界', () => {
    expect(getTokenUsageRatio(usage)).toBe(0.5);
    expect(getTokenUsageTone(0.5)).toBe('normal');
    expect(getTokenUsageTone(0.75)).toBe('warning');
    expect(getTokenUsageTone(0.9)).toBe('danger');
    expect(getTokenUsageTone(null)).toBe('normal');
  });

  it('不足 1% 时显示 <1%', () => {
    expect(getTokenUsagePercentLabel(0.004)).toBe('<1%');
    expect(getTokenUsagePercentLabel(0.5)).toBe('50%');
  });
});

describe('模型桶与累计指标', () => {
  const threadUsage = {
    thread: {
      total: { total_tokens: 12345 },
      models: {
        bucket: {
          model_call_count: 3,
          cache_hit_ratio: 0.5,
          cache_observed_call_count: 2,
          cache_observed_input_tokens: 2000,
          cache_read_input_tokens: 1000,
          model: {
            configured_model_spec: 'gpt-4o',
            configured_model_id: 'gpt-4o',
            response_model_ids: ['gpt-4o-2026', 'gpt-4o-mini'],
          },
          usage: {
            input_tokens: 2048,
            output_tokens: 512,
            output_token_details: { reasoning: 128 },
          },
        },
      },
    },
  };

  it('按模型桶给出调用次数、输入输出、缓存与推理', () => {
    const [model] = getModelUsageItems(threadUsage);

    expect(model).toMatchObject({
      name: 'gpt-4o',
      responseModel: 'gpt-4o-2026 等 2 个模型',
      callCount: 3,
      io: '2K / 512',
      cache: '1000 · 50%',
      reasoning: '128',
    });
  });

  it('没有响应模型差异时不显示「等 N 个」', () => {
    const [model] = getModelUsageItems({
      thread: {
        models: {
          bucket: { model: { response_model_ids: ['gpt-4o-2026'] }, usage: {} },
        },
      },
    });

    expect(model?.responseModel).toBe('gpt-4o-2026');
  });

  it('没有模型桶时返回空数组', () => {
    expect(getModelUsageItems({})).toEqual([]);
    expect(getModelUsageItems({ thread: { models: 'bad' } })).toEqual([]);
  });

  it('对话累计与缓存命中率缺失时为 null', () => {
    expect(getThreadTotalLabel(threadUsage)).toBe('12.1K');
    expect(getThreadTotalLabel({})).toBeNull();
    expect(getCacheHitLabel(threadUsage)).toBe('50%');
    expect(getCacheHitLabel({ thread: { models: { bucket: {} } } })).toBeNull();
  });

  it('最近调用行只在有 latest.usage 时出现', () => {
    expect(
      getLatestCallLabel({ latest: { usage: { input_tokens: 100, output_tokens: 20 } } }),
    ).toBe('输入 100 · 输出 20');
    expect(getLatestCallLabel({})).toBeNull();
  });
});

describe('构成条分段（相对上限堆叠）', () => {
  it('按上限裁剪并剔除被压缩部分', () => {
    const bar = getTokenUsageBarSegments(usage);

    // 上限取摘要阈值 4096；system 512 → 12.50%，其余按剩余空间依次排布
    expect(bar.map((segment) => segment.key)).toEqual([
      'system',
      'tools',
      'messages',
      'overhead',
    ]);
    expect(bar.find((segment) => segment.key === 'system')?.width).toBe('12.50%');
    expect(bar.every((segment) => segment.key !== 'cut')).toBe(true);
  });

  it('明细列表的占比含被压缩部分，与条宽不是同一个分母', () => {
    const segments = getTokenUsageSegments(usage);
    const cut = segments.find((segment) => segment.key === 'cut');

    // 分母 = max(cut 3072 + 输入 2048, 段和, 1) = 5120
    expect(cut?.percent).toBe('60.00%');
    expect(
      getTokenUsageBarSegments(usage).find((segment) => segment.key === 'cut'),
    ).toBeUndefined();
  });

  it('累计超过上限时填满且不溢出', () => {
    const bar = getTokenUsageBarSegments({
      llm_input_tokens: 100,
      system_tokens: 80,
      tools_tokens: 80,
      summary_trigger_tokens: 100,
    });

    expect(bar.map((segment) => segment.width)).toEqual(['80.00%', '20.00%']);
  });
});

describe('上限与命中率的边界', () => {
  it('占比上夹到 1', () => {
    expect(
      getTokenUsageRatio({ llm_input_tokens: 100, summary_trigger_tokens: 10 }),
    ).toBe(1);
  });

  it('观测到调用但没有输入 token 时命中率仍为 null', () => {
    expect(
      getCacheHitLabel({
        thread: {
          models: {
            b: { cache_observed_call_count: 1, cache_observed_input_tokens: 0 },
          },
        },
      }),
    ).toBeNull();
  });
});
