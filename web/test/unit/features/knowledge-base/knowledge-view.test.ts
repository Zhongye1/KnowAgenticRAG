import { describe, expect, it } from 'vitest';

import {
  formatBytes,
  formatCount,
  getKbTypeLabel,
} from '@/features/knowledge-base';

describe('知识库类型标签', () => {
  it('已知类型显示产品名，大小写不敏感', () => {
    expect(getKbTypeLabel('milvus')).toBe('ARS');
    expect(getKbTypeLabel('DIFY')).toBe('Dify');
    expect(getKbTypeLabel('Notion')).toBe('Notion');
  });

  it('未知类型原样显示，空值显示空串', () => {
    expect(getKbTypeLabel('weaviate')).toBe('weaviate');
    expect(getKbTypeLabel(null)).toBe('');
    expect(getKbTypeLabel(undefined)).toBe('');
  });
});

describe('体积格式化', () => {
  it('按 1024 进制换算并保留一位小数', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(1024 * 1024 * 3)).toBe('3.0 MB');
    expect(formatBytes(1024 ** 4 * 2)).toBe('2.0 TB');
  });

  it('缺失值显示占位而不是 0', () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(undefined)).toBe('—');
    expect(formatBytes(Number.NaN)).toBe('—');
  });
});

describe('计数格式化', () => {
  it('一万以下原样显示，超过折成万', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(9999)).toBe('9999');
    expect(formatCount(12000)).toBe('1.2 万');
  });

  it('缺失值显示占位', () => {
    expect(formatCount(null)).toBe('—');
    expect(formatCount(undefined)).toBe('—');
  });
});
