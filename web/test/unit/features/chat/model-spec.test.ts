import { describe, expect, it } from 'vitest';

import {
  DRAFT_MODEL_KEY,
  formatModelSpecLabel,
  modelOverrideKey,
  resolveModelSpec,
} from '@/features/chat/lib/model-spec';

describe('modelOverrideKey', () => {
  it('有会话用会话 id，没有会话用草稿键', () => {
    expect(modelOverrideKey('thread-A')).toBe('thread-A');
    expect(modelOverrideKey(null)).toBe(DRAFT_MODEL_KEY);
    expect(modelOverrideKey(undefined)).toBe(DRAFT_MODEL_KEY);
    expect(modelOverrideKey('')).toBe(DRAFT_MODEL_KEY);
  });
});

describe('resolveModelSpec', () => {
  const full = {
    override: 'override:m',
    threadMetadata: { model_spec: 'thread:m' },
    agentConfig: { model: 'agent:m' },
    systemDefault: 'system:m',
  };

  it('按覆盖 → 会话绑定 → 智能体配置 → 系统默认的顺序取值', () => {
    expect(resolveModelSpec(full)).toBe('override:m');
    expect(resolveModelSpec({ ...full, override: '' })).toBe('thread:m');
    expect(resolveModelSpec({ ...full, override: '', threadMetadata: {} })).toBe('agent:m');
    expect(
      resolveModelSpec({ ...full, override: '', threadMetadata: {}, agentConfig: {} }),
    ).toBe('system:m');
  });

  it('都取不到时返回空串', () => {
    expect(resolveModelSpec({})).toBe('');
    expect(resolveModelSpec({ override: null, systemDefault: 42 })).toBe('');
  });

  it('空串与纯空白都不算选中', () => {
    expect(resolveModelSpec({ override: '   ', agentConfig: { model: 'agent:m' } })).toBe('agent:m');
    expect(resolveModelSpec({ threadMetadata: { model_spec: '  ' }, systemDefault: 'system:m' })).toBe(
      'system:m',
    );
  });
});

describe('formatModelSpecLabel', () => {
  it('取模型名的最后一段', () => {
    expect(formatModelSpecLabel('siliconflow-cn:Pro/MiniMaxAI/MiniMax-M2.5', '选择模型')).toBe(
      'MiniMax-M2.5',
    );
  });

  it('没有斜杠时就是模型名', () => {
    expect(formatModelSpecLabel('p:qwen-max', '选择模型')).toBe('qwen-max');
  });

  it('没有 provider 前缀时按整串取最后一段', () => {
    expect(formatModelSpecLabel('a/b', '选择模型')).toBe('b');
  });

  it('空值回落到占位文案', () => {
    expect(formatModelSpecLabel('', '选择模型')).toBe('选择模型');
    expect(formatModelSpecLabel(null, '选择模型')).toBe('选择模型');
    expect(formatModelSpecLabel('   ', '选择模型')).toBe('选择模型');
  });
});
