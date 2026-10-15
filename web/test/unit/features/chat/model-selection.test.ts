import { beforeEach, describe, expect, it } from 'vitest';

import { normalizeChatModels } from '@/features/chat/api/model-api';
import { useModelSelection } from '@/features/chat/model/model-selection';

describe('normalizeChatModels', () => {
  it('按供应商分组，缺供应商名时退到 id', () => {
    expect(
      normalizeChatModels({
        'siliconflow-cn': {
          provider_id: 'siliconflow-cn',
          provider_display_name: 'SiliconFlow',
          models: [
            { spec: 'siliconflow-cn:qwen-max', display_name: 'Qwen Max' },
          ],
        },
        other: {
          models: [{ spec: 'other:m', model_id: 'm' }],
        },
      }),
    ).toEqual([
      {
        providerId: 'siliconflow-cn',
        providerName: 'SiliconFlow',
        models: [{ spec: 'siliconflow-cn:qwen-max', label: 'Qwen Max' }],
      },
      {
        providerId: 'other',
        providerName: 'other',
        models: [{ spec: 'other:m', label: 'm' }],
      },
    ]);
  });

  it('缺 spec 的模型丢掉，缺展示名时退到 model_id 再退到 spec', () => {
    const groups = normalizeChatModels({
      p: {
        provider_id: 'p',
        models: [
          { display_name: '没有 spec' },
          { spec: 'p:m1' },
          { spec: 'p:m2', model_id: 'M2' },
        ],
      },
    });

    expect(groups[0]!.models).toEqual([
      { spec: 'p:m1', label: 'p:m1' },
      { spec: 'p:m2', label: 'M2' },
    ]);
  });

  it('整组没有可用模型时不出现', () => {
    expect(
      normalizeChatModels({ p: { provider_id: 'p', models: [] } }),
    ).toEqual([]);
    expect(
      normalizeChatModels({ p: { provider_id: 'p', models: [{}, null] } }),
    ).toEqual([]);
  });

  it('归一后的重复供应商与重复模型被去掉', () => {
    const groups = normalizeChatModels({
      p: {
        provider_id: 'p',
        provider_display_name: 'P',
        models: [{ spec: 'p:m1' }, { spec: 'p:m1', model_id: '重复' }],
      },
      'p-alias': { provider_id: 'p', models: [{ spec: 'p:m2' }] },
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]!.models.map((item) => item.spec)).toEqual(['p:m1']);
  });

  it('形状不符时返回空数组', () => {
    expect(normalizeChatModels(null)).toEqual([]);
    expect(normalizeChatModels('nope')).toEqual([]);
    expect(normalizeChatModels([1, 2])).toEqual([]);
    expect(normalizeChatModels({ p: 'nope' })).toEqual([]);
  });
});

describe('模型覆盖表', () => {
  beforeEach(() => {
    useModelSelection.setState({ overrideByKey: {} });
  });

  it('按会话记覆盖；传空串清掉', () => {
    const { setOverride } = useModelSelection.getState();
    setOverride('thread-A', 'p:m');

    expect(useModelSelection.getState().overrideByKey).toEqual({
      'thread-A': 'p:m',
    });

    setOverride('thread-A', '');
    expect(useModelSelection.getState().overrideByKey).toEqual({});
  });

  it('没有会话时记在草稿键上', () => {
    useModelSelection.getState().setOverride(null, 'p:m');

    expect(useModelSelection.getState().overrideByKey).toEqual({
      __draft__: 'p:m',
    });
  });

  it('新建会话后草稿态的选择挪到会话上', () => {
    const { setOverride, promoteDraft } = useModelSelection.getState();
    setOverride(null, 'draft:m');

    promoteDraft('thread-A');

    expect(useModelSelection.getState().overrideByKey).toEqual({
      'thread-A': 'draft:m',
    });
  });

  it('目标会话已经有选择时以它为准，但草稿键仍然清掉', () => {
    const { setOverride, promoteDraft } = useModelSelection.getState();
    setOverride(null, 'draft:m');
    setOverride('thread-B', 'b:m');

    promoteDraft('thread-B');

    // 草稿位是「还没建会话」的临时位，会话一建出来就不再成立
    expect(useModelSelection.getState().overrideByKey).toEqual({
      'thread-B': 'b:m',
    });
  });

  it('没有草稿选择时提升是空操作', () => {
    useModelSelection.getState().promoteDraft('thread-A');

    expect(useModelSelection.getState().overrideByKey).toEqual({});
  });
});
