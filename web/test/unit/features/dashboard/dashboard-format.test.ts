/**
 * 数据总览的展示格式化用例。
 *
 * 这些函数是数字、容量、时间在界面上的事实 Owner：千分位、1024 进制与四位有效数字、
 * Token 折算位数、本地时间补零与长标识截断。每个用例名里标出变异点。
 */
import { describe, expect, it } from 'vitest';

import {
  formatFullDateTime,
  formatNumber,
  formatStorageSize,
  formatTokenValue,
  truncateIdentifier,
} from '@/features/dashboard/lib/dashboard-format';

describe('指标数字', () => {
  it('千分位分组；缺失或不可解析时按 0', () => {
    // 变异：`value ?? 0` 改成 `value || 0` 不影响结果，但去掉 Number() 会让字符串原样输出
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(null)).toBe('0');
    expect(formatNumber(undefined)).toBe('0');
    expect(formatNumber(Number.NaN)).toBe('0');
    expect(formatNumber('42')).toBe('42');
  });
});

describe('存储容量', () => {
  it('1024 进制换算并保留最多四位有效数字', () => {
    expect(formatStorageSize(0)).toEqual({ value: '0', unit: 'B' });
    expect(formatStorageSize(1023)).toEqual({ value: '1023', unit: 'B' });
    expect(formatStorageSize(1024)).toEqual({ value: '1', unit: 'KB' });
    expect(formatStorageSize(1536)).toEqual({ value: '1.5', unit: 'KB' });
    expect(formatStorageSize(1024 ** 3)).toEqual({ value: '1', unit: 'GB' });
    // 四位有效数字：1.205078125 KB 截到 1.205
    expect(formatStorageSize(1234)).toEqual({ value: '1.205', unit: 'KB' });
    // 超过 1024 继续进位：1234 GB → 1.205 TB
    expect(formatStorageSize(1024 ** 3 * 1234)).toEqual({
      value: '1.205',
      unit: 'TB',
    });
  });

  it('负数与不可解析值按 0，不上抛单位', () => {
    // 变异：去掉 Math.max(..., 0) 会让 -2048 变成 -2 KB
    expect(formatStorageSize(-2048)).toEqual({ value: '0', unit: 'B' });
    expect(formatStorageSize(Number.NaN)).toEqual({ value: '0', unit: 'B' });
  });
});

describe('Token 折算', () => {
  it('按量级选小数位：<10 两位、>=10 一位、>=100 取整', () => {
    // 变异：三档阈值写成固定两位会让 1500000 变成 1.50M
    expect(formatTokenValue(0)).toBe('0.00M');
    expect(formatTokenValue(1_500_000)).toBe('1.50M');
    expect(formatTokenValue(15_000_000)).toBe('15.0M');
    expect(formatTokenValue(150_000_000)).toBe('150M');
    expect(formatTokenValue(null)).toBe('0.00M');
    expect(formatTokenValue(Number.NaN)).toBe('0M');
  });
});

describe('完整时间', () => {
  it('无时区后缀的时间串按本地时间渲染并补零', () => {
    // 解析与格式化用同一时区，结果与机器时区无关
    expect(formatFullDateTime('2026-10-01T18:33:09')).toBe(
      '2026-10-01 18:33:09',
    );
    expect(formatFullDateTime('2026-01-02T03:04:05')).toBe(
      '2026-01-02 03:04:05',
    );
  });

  it('缺失或不可解析时回 `-`', () => {
    // 变异：去掉 Number.isNaN 判定会渲染出 `NaN-NaN-NaN ...`
    expect(formatFullDateTime(null)).toBe('-');
    expect(formatFullDateTime('')).toBe('-');
    expect(formatFullDateTime('不是时间')).toBe('-');
  });
});

describe('长标识截断', () => {
  it('超过「前 8 + 后 4 + 1」才截断，保留首尾', () => {
    // 变异：把阈值写成 start + end 会让 13 位标识被截断
    expect(truncateIdentifier('1234567890123')).toBe('1234567890123');
    expect(truncateIdentifier('12345678901234')).toBe('12345678…1234');
    expect(truncateIdentifier('5a695ef6-e56f-4710-a7ef-d469f4d64db7')).toBe(
      '5a695ef6…4db7',
    );
  });

  it('空值回空串而不是 `undefined`', () => {
    expect(truncateIdentifier(null)).toBe('');
    expect(truncateIdentifier(undefined)).toBe('');
  });
});
