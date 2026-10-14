import { describe, expect, it } from 'vitest';

import { normalizeCatalog } from '@/features/basic-settings/api/model-catalog-api';

describe('normalizeCatalog', () => {
  it('按供应商分组，保留 spec、展示名与向量维度', () => {
    const groups = normalizeCatalog({
      siliconflow: {
        provider_id: 'siliconflow',
        provider_display_name: 'SiliconFlow',
        models: [
          {
            spec: 'siliconflow:bge-m3',
            display_name: 'bge-m3',
            dimension: 1024,
          },
        ],
      },
    });

    expect(groups).toEqual([
      {
        providerId: 'siliconflow',
        providerName: 'SiliconFlow',
        models: [
          { spec: 'siliconflow:bge-m3', label: 'bge-m3', dimension: 1024 },
        ],
      },
    ]);
  });

  it('缺 spec 的模型与没有模型的组都不出现，缺供应商名退到 id', () => {
    const groups = normalizeCatalog({
      a: { models: [{ display_name: '没有 spec' }] },
      b: { provider_id: 'b', models: [{ spec: 'b:m1' }] },
      c: { models: [] },
    });

    expect(groups).toEqual([
      {
        providerId: 'b',
        providerName: 'b',
        models: [{ spec: 'b:m1', label: 'b:m1', dimension: null }],
      },
    ]);
  });

  it('同一供应商 id 与同一 spec 只保留一次，避免渲染重复 key', () => {
    const groups = normalizeCatalog({
      dup: { provider_id: 'siliconflow', models: [{ spec: 's:m1' }] },
      siliconflow: { provider_id: 'siliconflow', models: [{ spec: 's:m2' }] },
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].models.map((model) => model.spec)).toEqual(['s:m1']);
  });

  it('非对象响应给空数组', () => {
    expect(normalizeCatalog(null)).toEqual([]);
    expect(normalizeCatalog([{ spec: 'x' }])).toEqual([]);
    expect(normalizeCatalog('nope')).toEqual([]);
  });
});
