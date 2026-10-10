/**
 * 调试弹窗的纯逻辑：日志解析与过滤、配置项归一、本地存储条目、导出与文件名。
 */
import { describe, expect, it } from 'vitest';

import {
  buildConfigItems,
  buildLogFileName,
  buildStorageExport,
  filterConfigItems,
  filterLogLines,
  filterStorageItems,
  formatConfigValue,
  logLevelClass,
  LOG_LEVELS,
  parseLogLine,
  readStorageItems,
  splitLogText,
  totalStorageBytes,
} from '@/features/debug/lib/debug-view';

/** 假 storage：实现 readStorageItems 用到的三个方法。 */
const fakeStorage = (entries: Record<string, string>) => {
  const keys = Object.keys(entries);
  return {
    get length() {
      return keys.length;
    },
    key: (index: number) => keys[index] ?? null,
    getItem: (key: string) => entries[key] ?? null,
  };
};

describe('日志行解析', () => {
  it('拆出时间、级别、模块与消息', () => {
    expect(
      parseLogLine('2026-10-09 12:00:01,123 - ERROR - ars.services.x - 炸了'),
    ).toEqual({
      timestamp: '2026-10-09 12:00:01,123',
      level: 'ERROR',
      module: 'ars.services.x',
      message: '炸了',
      raw: '2026-10-09 12:00:01,123 - ERROR - ars.services.x - 炸了',
    });
  });

  it('毫秒可省略', () => {
    expect(parseLogLine('2026-10-09 12:00:01 - INFO - a - b')).toMatchObject({
      timestamp: '2026-10-09 12:00:01',
      level: 'INFO',
    });
  });

  it('消息里还有分隔符时只切前三段', () => {
    expect(
      parseLogLine('2026-10-09 12:00:01 - INFO - a - 一 - 二').message,
    ).toBe('一 - 二');
  });

  it('不符合格式的行不丢：按 INFO 处理并保留原文', () => {
    expect(parseLogLine('Traceback (most recent call last):')).toEqual({
      timestamp: '',
      level: 'INFO',
      module: '',
      message: 'Traceback (most recent call last):',
      raw: 'Traceback (most recent call last):',
    });
  });

  it('按行切分时丢掉空行', () => {
    expect(splitLogText('a\n\n  \nb\n')).toEqual(['a', 'b']);
  });
});

describe('日志过滤', () => {
  const lines = ['2026-10-09 12:00:01 - INFO - a - 开始'].map(parseLogLine);

  it('级别比较不区分大小写（后端偶发小写级别）', () => {
    const lower = [{ ...lines[0], level: 'info' }];
    expect(filterLogLines(lower, ['INFO'], '')).toHaveLength(1);
    expect(filterLogLines(lower, ['ERROR'], '')).toHaveLength(0);
  });

  it('级别未勾选即过滤掉；全不勾选剩空', () => {
    expect(filterLogLines(lines, ['DEBUG'], '')).toHaveLength(0);
    expect(filterLogLines(lines, [], '')).toHaveLength(0);
  });

  it('关键字匹配整行原文（含时间与模块），忽略大小写与首尾空格', () => {
    expect(filterLogLines(lines, [...LOG_LEVELS], '  开始 ')).toHaveLength(1);
    expect(
      filterLogLines(lines, [...LOG_LEVELS], '2026-10-09 12:00'),
    ).toHaveLength(1);
    expect(filterLogLines(lines, [...LOG_LEVELS], '没有')).toHaveLength(0);
  });

  it('级别配色按级别分档', () => {
    expect(logLevelClass('ERROR')).toBe('text-danger-6');
    expect(logLevelClass('warning')).toBe('text-warning-6');
    expect(logLevelClass('DEBUG')).toBe('text-color-text-3');
    expect(logLevelClass('INFO')).toBe('text-primary-6');
  });
});

describe('配置项归一', () => {
  it('把 _config_items 的类型与说明并进条目，且自身不再作为条目出现', () => {
    const items = buildConfigItems({
      RAG_TOP_K: 5,
      _config_items: {
        RAG_TOP_K: { type: 'int', des: '检索条数' },
      },
    });

    expect(items).toEqual([
      { key: 'RAG_TOP_K', value: 5, type: 'int', description: '检索条数' },
    ]);
  });

  it('没有元数据时类型退化为 JS 类型，说明为空', () => {
    expect(buildConfigItems({ FLAG: true })).toEqual([
      { key: 'FLAG', value: true, type: 'boolean', description: '' },
    ]);
    expect(buildConfigItems(null)).toEqual([]);
  });

  it('搜索覆盖键、值与说明', () => {
    const items = buildConfigItems({
      A: 'xyz',
      B: 1,
      _config_items: { B: { type: 'int', des: '说明命中' } },
    });

    expect(filterConfigItems(items, 'xy').map((item) => item.key)).toEqual([
      'A',
    ]);
    expect(filterConfigItems(items, '说明').map((item) => item.key)).toEqual([
      'B',
    ]);
    expect(filterConfigItems(items, '  ').map((item) => item.key)).toEqual([
      'A',
      'B',
    ]);
  });

  it('值转文本：对象用 JSON，null 与 undefined 显式写出', () => {
    expect(formatConfigValue({ a: 1 })).toBe('{"a":1}');
    expect(formatConfigValue(null)).toBe('null');
    expect(formatConfigValue(undefined)).toBe('null');
    expect(formatConfigValue('文本')).toBe('文本');
  });
});

describe('本地存储条目', () => {
  it('系统键排在前面，其余按 key 排序', () => {
    const items = readStorageItems(
      fakeStorage({
        zeta: '1',
        ars_access_token: 'tok',
        alpha: '2',
        theme: 'dark',
      }),
    );

    expect(items.map((item) => item.key)).toEqual([
      'ars_access_token',
      'theme',
      'alpha',
      'zeta',
    ]);
    expect(items.map((item) => item.isSystem)).toEqual([
      true,
      true,
      false,
      false,
    ]);

    // 主题键是 ars-theme（连字符），前缀表要能命中
    expect(
      readStorageItems(fakeStorage({ 'ars-theme': 'dark' }))[0].isSystem,
    ).toBe(true);
  });

  it('值超过 120 字符时预览被截断，但原值保留', () => {
    const long = 'x'.repeat(200);
    const [item] = readStorageItems(fakeStorage({ k: long }));

    expect(item.preview).toHaveLength(123);
    expect(item.preview.endsWith('...')).toBe(true);
    expect(item.value).toBe(long);
    expect(item.bytes).toBe(200);
    expect(item.sizeText).toBe('200 B');
  });

  it('读到 null 的 key 时跳过，不产生空条目', () => {
    const items = readStorageItems({
      length: 1,
      key: () => null,
      getItem: () => null,
    });

    expect(items).toEqual([]);
  });

  it('凭据条目不暴露值：预览写「已隐藏」，值清空，导出也跳过', () => {
    const items = readStorageItems(
      fakeStorage({ ars_access_token: 'super-secret', theme: 'dark' }),
    );
    const credential = items.find((item) => item.key === 'ars_access_token');

    expect(credential).toMatchObject({
      value: '',
      preview: '（凭据已隐藏）',
      masked: true,
      isSystem: true,
    });
    expect(credential?.bytes).toBe('super-secret'.length);
    expect(buildStorageExport(items)).toEqual({
      payload: { theme: 'dark' },
      json: JSON.stringify({ theme: 'dark' }, null, 2),
    });
  });

  it('搜索覆盖键与值', () => {
    const items = readStorageItems(
      fakeStorage({ alpha: '值里有针', beta: '无' }),
    );

    expect(filterStorageItems(items, 'ALPHA').map((item) => item.key)).toEqual([
      'alpha',
    ]);
    expect(filterStorageItems(items, '针').map((item) => item.key)).toEqual([
      'alpha',
    ]);
    expect(filterStorageItems(items, '')).toHaveLength(2);
    expect(
      filterStorageItems(
        readStorageItems(fakeStorage({ ars_access_token: 'x', k: 'v' })),
        'access',
      ),
    ).toHaveLength(1);
  });

  it('总量是各条字节数之和，导出是键值对 JSON', () => {
    const items = readStorageItems(fakeStorage({ a: '123', b: '45' }));

    expect(totalStorageBytes(items)).toBe(5);
    expect(buildStorageExport(items)).toEqual({
      payload: { a: '123', b: '45' },
      json: JSON.stringify({ a: '123', b: '45' }, null, 2),
    });
  });

  it('字节数转可读文本分档', () => {
    const [small] = readStorageItems(fakeStorage({ a: 'x'.repeat(10) }));
    expect(small.sizeText).toBe('10 B');
    const [kb] = readStorageItems(fakeStorage({ a: 'x'.repeat(2048) }));
    expect(kb.sizeText).toBe('2.0 KB');
    const [mb] = readStorageItems(fakeStorage({ a: 'x'.repeat(1024 * 1024) }));
    expect(mb.sizeText).toBe('1.00 MB');
  });
});

describe('日志文件名', () => {
  it('按本地时间补零到 ars-api-log-YYYYMMDD_HHmmss.log', () => {
    expect(buildLogFileName(new Date(2026, 9, 9, 8, 7, 6))).toBe(
      'ars-api-log-20261009_080706.log',
    );
  });
});
