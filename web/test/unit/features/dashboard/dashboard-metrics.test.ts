/**
 * 指标档位用例。
 *
 * 满意度 80/60、成功率 90/70 是产品口径，界面颜色与数值色调都由这两个函数决定。
 * 边界值必须落在「更高一档」，否则 80% 的满意度会被画成警告色。
 */
import { describe, expect, it } from 'vitest';

import {
  formatPercent,
  metricValueTone,
  parseRate,
  satisfactionTextTone,
  satisfactionTone,
  successRateTone,
} from '@/features/dashboard/lib/dashboard-metrics';

describe('满意度档位（80 / 60）', () => {
  it('达到阈值即进更高一档', () => {
    // 变异：`>=` 改成 `>` 会让 80 掉进警告档
    expect(satisfactionTone(100)).toBe('success');
    expect(satisfactionTone(80)).toBe('success');
    expect(satisfactionTone(79.9)).toBe('warning');
    expect(satisfactionTone(60)).toBe('warning');
    expect(satisfactionTone(59.9)).toBe('neutral');
    expect(satisfactionTone(0)).toBe('neutral');
  });

  it('缺字段与字符串数字按同一口径', () => {
    // 变异：不经过 parseRate 会让 '80' 直接比较字符串，进到错误档位
    expect(satisfactionTone(undefined)).toBe('neutral');
    expect(satisfactionTone('80.0')).toBe('success');
    expect(satisfactionTone('abc')).toBe('neutral');
  });
});

describe('成功率档位（90 / 70）', () => {
  it('工具成功率的三档边界', () => {
    // 变异：阈值写成 80/60 会让 85% 的成功率显示为正常
    expect(successRateTone(90)).toBe('success');
    expect(successRateTone(89.99)).toBe('warning');
    expect(successRateTone(70)).toBe('warning');
    expect(successRateTone(69.99)).toBe('neutral');
    expect(successRateTone(0)).toBe('neutral');
  });
});

describe('表格文字档位', () => {
  it('低于 60 用危险色，与指标卡的中性色区分', () => {
    expect(satisfactionTextTone(80)).toBe('success');
    expect(satisfactionTextTone(60)).toBe('warning');
    expect(satisfactionTextTone(59)).toBe('danger');
  });

  it('数值色调只给「需注意 / 偏低」上色，正常档保持默认文字色', () => {
    // 变异：success 也映射成 'success' 会让 6 张卡片都变成彩色数字（语义色做装饰）
    expect(metricValueTone('success')).toBeUndefined();
    expect(metricValueTone('info')).toBeUndefined();
    expect(metricValueTone('warning')).toBe('warning');
    expect(metricValueTone('neutral')).toBe('danger');
  });
});

describe('百分比文案', () => {
  it('整数不带小数位，非整数保留一位', () => {
    expect(formatPercent(100)).toBe('100%');
    expect(formatPercent('100.0')).toBe('100%');
    expect(formatPercent(66.666)).toBe('66.7%');
    expect(formatPercent(undefined)).toBe('0%');
  });

  it('parseRate 把不可解析值折成 0', () => {
    expect(parseRate(null)).toBe(0);
    expect(parseRate('')).toBe(0);
    expect(parseRate('42.5')).toBe(42.5);
  });
});
