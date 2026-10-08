import { describe, expect, it } from 'vitest';

import {
  HIDDEN_TOOL_CALL_IDS,
  getToolCallId,
  getToolName,
  isHiddenToolCall,
  isValidToolCall,
  normalizeToolCalls,
  formatToolCallResult,
  parseToolCallArgs,
  parseToolCallResultForDisplay,
} from '@/features/chat/lib/tool-call';

describe('工具标识', () => {
  it('工具 id 取 name，兼容被 function 包裹的来源', () => {
    expect(getToolCallId({ name: 'bash' })).toBe('bash');
    expect(getToolCallId({ function: { name: 'grep' } })).toBe('grep');
    expect(getToolCallId(null)).toBe('');
  });

  it('已知工具给出中文显示名，未知工具原样返回', () => {
    expect(getToolName('run_shell_command')).toBe('执行命令');
    expect(getToolName('brand_new_tool')).toBe('brand_new_tool');
  });

  it('隐藏工具清单集中声明，判定按 id 命中', () => {
    expect(HIDDEN_TOOL_CALL_IDS).toContain('present_artifacts');
    expect(isHiddenToolCall({ name: 'present_artifacts' })).toBe(true);
    expect(isHiddenToolCall({ name: 'bash' })).toBe(false);
  });
});

describe('isValidToolCall', () => {
  it('既要有 id 也要有参数或结果，流式半截分片不算有效', () => {
    expect(isValidToolCall({ name: 'bash', args: {} })).toBe(true);
    expect(isValidToolCall({ name: 'bash' })).toBe(false);
    expect(isValidToolCall({ args: {} })).toBe(false);
    expect(isValidToolCall({ id: 't-1', name: 'bash', tool_call_result: {} })).toBe(
      true,
    );
  });
});

describe('parseToolCallArgs', () => {
  it('参数是对象时直接使用', () => {
    expect(parseToolCallArgs({ name: 'bash', args: { command: 'ls' } })).toEqual({
      command: 'ls',
    });
  });

  it('参数是 JSON 字符串时解析', () => {
    expect(
      parseToolCallArgs({ function: { name: 'bash', arguments: '{"a":1}' } }),
    ).toEqual({ a: 1 });
  });

  it('解析失败或缺失时返回空对象，不抛给渲染层', () => {
    expect(parseToolCallArgs({ function: { arguments: '{坏掉的' } })).toEqual({});
    expect(parseToolCallArgs(null)).toEqual({});
    expect(parseToolCallArgs({ name: 'bash', args: '"文本"' })).toEqual({});
  });
});

describe('parseToolCallResultForDisplay', () => {
  it('JSON 能解析时给结构化数据，解析失败时保底返回原文', () => {
    expect(
      parseToolCallResultForDisplay({
        tool_call_result: { content: '{"rows":2}' },
      }),
    ).toEqual({ rows: 2 });
    expect(
      parseToolCallResultForDisplay({ tool_call_result: { content: '普通输出' } }),
    ).toBe('普通输出');
    expect(
      parseToolCallResultForDisplay({ tool_call_result: { content: { ok: true } } }),
    ).toEqual({ ok: true });
    expect(parseToolCallResultForDisplay({})).toBeNull();
  });
});

describe('formatToolCallResult', () => {
  it('对象按两空格缩进，其余转字符串', () => {
    expect(formatToolCallResult({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(formatToolCallResult('文本')).toBe('文本');
    expect(formatToolCallResult(null)).toBe('');
  });
});

describe('normalizeToolCalls', () => {
  it('丢掉无效与隐藏的调用', () => {
    const calls = normalizeToolCalls([
      { name: 'bash', args: {} },
      { name: 'bash' },
      { name: 'present_artifacts', args: {} },
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe('bash');
  });

  it('非数组输入返回空数组', () => {
    expect(normalizeToolCalls(null)).toEqual([]);
    expect(normalizeToolCalls(undefined)).toEqual([]);
  });
});
