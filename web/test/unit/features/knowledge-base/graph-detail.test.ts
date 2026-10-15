/**
 * 详情面板纯逻辑：边属性过滤、取值渲染、竖排与截断判定。
 */
import { describe, expect, it } from 'vitest';

import {
  displayValue,
  formatGraphValue,
  isStackedValue,
  isTruncatable,
  STACK_THRESHOLD,
  TRUNCATE_LIMIT,
  visibleEdgeProperties,
} from '@/features/knowledge-base/lib/graph-detail';

describe('边属性过滤', () => {
  it('丢掉端点与渲染残留键，其余保持后端顺序', () => {
    const entries = visibleEdgeProperties({
      source_id: 'n-1',
      target_id: 'n-2',
      _id: 'x',
      truncate: true,
      weight: 0.8,
      type: 'KNOWS',
    });

    expect(entries).toEqual([
      ['weight', 0.8],
      ['type', 'KNOWS'],
    ]);
  });

  it('没有属性时给空数组', () => {
    expect(visibleEdgeProperties(null)).toEqual([]);
    expect(visibleEdgeProperties(undefined)).toEqual([]);
  });
});

describe('取值渲染', () => {
  it('原始值按原样，空值统一显示 -', () => {
    expect(formatGraphValue('张三')).toBe('张三');
    expect(formatGraphValue(12)).toBe('12');
    expect(formatGraphValue(false)).toBe('false');
    expect(formatGraphValue('')).toBe('-');
    expect(formatGraphValue(null)).toBe('-');
    expect(formatGraphValue(undefined)).toBe('-');
  });

  it('对象与数组用 JSON，而不是 [object Object]', () => {
    expect(formatGraphValue({ a: 1 })).toBe('{"a":1}');
    expect(formatGraphValue([1, 2])).toBe('[1,2]');
  });

  it('循环引用不抛错，退回字符串描述', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(typeof formatGraphValue(cyclic)).toBe('string');
  });
});

describe('竖排与截断', () => {
  it('阈值边界：等于阈值不竖排、超过才竖排', () => {
    expect(isStackedValue('x'.repeat(STACK_THRESHOLD))).toBe(false);
    expect(isStackedValue('x'.repeat(STACK_THRESHOLD + 1))).toBe(true);
    expect(isStackedValue(123)).toBe(false);
  });

  it('截断阈值边界：等于阈值不截断、超过才给展开', () => {
    expect(isTruncatable('x'.repeat(TRUNCATE_LIMIT))).toBe(false);
    expect(isTruncatable('x'.repeat(TRUNCATE_LIMIT + 1))).toBe(true);
  });

  it('展开后显示全文，未展开时截断并带省略号', () => {
    const long = 'x'.repeat(TRUNCATE_LIMIT + 20);

    expect(displayValue(long, false)).toBe(`${'x'.repeat(TRUNCATE_LIMIT)}...`);
    expect(displayValue(long, true)).toBe(long);
    expect(displayValue('短值', false)).toBe('短值');
  });
});
