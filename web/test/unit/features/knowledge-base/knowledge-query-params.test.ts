import { describe, expect, it } from 'vitest';

import {
  buildQueryMeta,
  type KnowledgeQueryParams,
} from '@/features/knowledge-base';
import { coerceQueryParamValue } from '@/features/knowledge-base/lib/knowledge-query-params';

const params: KnowledgeQueryParams = {
  type: 'milvus',
  options: [
    { key: 'search_mode', type: 'select', default: 'vector' },
    { key: 'final_top_k', type: 'number', default: 10 },
    { key: 'use_reranker', type: 'boolean', default: false },
    { key: 'include_distances', type: 'boolean', default: true },
    { key: 'reranker_model', default: '' },
  ],
};

describe('查询参数组装', () => {
  it('按类型归一值', () => {
    expect(coerceQueryParamValue({ key: 'a', type: 'boolean' }, '')).toBe(
      false,
    );
    expect(coerceQueryParamValue({ key: 'a', type: 'boolean' }, 'true')).toBe(
      true,
    );
    expect(coerceQueryParamValue({ key: 'a', type: 'number' }, '12')).toBe(12);
    // 转不成数字就按原样，交给后端报错
    expect(coerceQueryParamValue({ key: 'a', type: 'number' }, 'abc')).toBe(
      'abc',
    );
    expect(coerceQueryParamValue({ key: 'a', type: 'select' }, 'vector')).toBe(
      'vector',
    );
  });

  it('已存的值优先，缺的用默认值，隐藏项固定为 true', () => {
    const meta = buildQueryMeta(params, { final_top_k: '25' });

    expect(meta).toEqual({
      search_mode: 'vector',
      final_top_k: 25,
      use_reranker: false,
      include_distances: true,
      reranker_model: '',
    });
  });

  it('不受支持的键会被丢掉', () => {
    const meta = buildQueryMeta(params, { unknown_key: 1, kb_id: 'kb-1' });

    expect(meta.unknown_key).toBeUndefined();
    expect(meta.kb_id).toBeUndefined();
  });

  it('默认值为空的键不带进 meta', () => {
    const meta = buildQueryMeta({
      options: [{ key: 'empty', default: null }],
    });

    expect('empty' in meta).toBe(false);
  });
});
