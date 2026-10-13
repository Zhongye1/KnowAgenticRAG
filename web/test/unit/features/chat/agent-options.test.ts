import { describe, expect, it } from 'vitest';

import {
  agentSwitchBlockReason,
  buildAgentOptions,
  currentAgentLabel,
} from '@/features/chat/lib/agent-options';

describe('buildAgentOptions', () => {
  it('值取 slug 而不是自增 id', () => {
    expect(
      buildAgentOptions([{ id: 12, slug: 'assistant', name: '助手' }]),
    ).toEqual([{ value: 'assistant', label: '助手', icon: '', isBuiltin: false }]);
  });

  it('排除子智能体', () => {
    expect(
      buildAgentOptions([
        { slug: 'a', name: 'A', is_subagent: true },
        { slug: 'b', name: 'B' },
      ]).map((option) => option.value),
    ).toEqual(['b']);
  });

  it('缺 slug 的条目丢掉，缺名称时退到 slug', () => {
    expect(
      buildAgentOptions([{ name: '无标识' }, { slug: 'x' }]),
    ).toEqual([{ value: 'x', label: 'x', icon: '', isBuiltin: false }]);
  });

  it('读出内置标记与图标', () => {
    expect(
      buildAgentOptions([{ slug: 'a', name: 'A', icon: '/i.png', is_builtin: true }])[0],
    ).toEqual({ value: 'a', label: 'A', icon: '/i.png', isBuiltin: true });
  });

  it('形状不符时返回空数组', () => {
    expect(buildAgentOptions(null)).toEqual([]);
    expect(buildAgentOptions('x')).toEqual([]);
    expect(buildAgentOptions({ agents: [] })).toEqual([]);
  });
});

describe('currentAgentLabel', () => {
  const options = buildAgentOptions([{ slug: 'a', name: 'A' }]);

  it('加载中优先显示「加载中...」', () => {
    expect(currentAgentLabel(options, 'a', true)).toBe('加载中...');
  });

  it('命中时给名称，未命中时给「智能体」', () => {
    expect(currentAgentLabel(options, 'a')).toBe('A');
    expect(currentAgentLabel(options, 'zzz')).toBe('智能体');
    expect(currentAgentLabel(options, null)).toBe('智能体');
  });
});

describe('agentSwitchBlockReason', () => {
  it('建线程中优先于「已绑定」', () => {
    expect(
      agentSwitchBlockReason({ hasActiveThread: true, isCreatingThread: true }),
    ).toBe('正在创建新对话，请稍候');
  });

  it('已绑定会话时不许中途换', () => {
    expect(
      agentSwitchBlockReason({ hasActiveThread: true, isCreatingThread: false }),
    ).toBe('当前对话已绑定智能体，请新建对话后切换');
  });

  it('新对话可以换', () => {
    expect(
      agentSwitchBlockReason({ hasActiveThread: false, isCreatingThread: false }),
    ).toBeNull();
  });
});
