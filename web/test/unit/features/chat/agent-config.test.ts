import { describe, expect, it } from 'vitest';

import {
  applyConfigDefaults,
  readAgentContext,
} from '@/features/chat/lib/agent-config';

describe('applyConfigDefaults', () => {
  it('没存过的配置项补上 schema 默认值', () => {
    const config = applyConfigDefaults(
      { model: { default: 'qwen-max' }, skills: { default: null } },
      {},
    );

    expect(config).toEqual({ model: 'qwen-max', skills: null });
  });

  it('已存下来的值不被默认值覆盖', () => {
    const config = applyConfigDefaults(
      { model: { default: 'qwen-max' } },
      { model: 'gpt-4o' },
    );

    expect(config.model).toBe('gpt-4o');
  });

  it('显式的 null 仍然是 null，不回落到默认值', () => {
    // 「null 表示默认全部」由配置项的 kind 判定，补成默认值会把它变成「只选默认那一项」
    const config = applyConfigDefaults(
      { knowledges: { kind: 'knowledges', default: ['kb-1'] } },
      { knowledges: null },
    );

    expect(config.knowledges).toBeNull();
  });

  it('非「默认全部」种类的 null 会补上默认值', () => {
    const config = applyConfigDefaults(
      { model: { kind: 'llm', default: 'qwen-max' } },
      { model: null },
    );

    expect(config.model).toBe('qwen-max');
  });

  it('配置项没有 default 时不写入该键', () => {
    const config = applyConfigDefaults({ other: { type: 'str' } }, {});

    expect(Object.keys(config)).toEqual([]);
  });

  it('返回新对象，不改入参', () => {
    const agentConfig = { model: 'gpt-4o' };
    const config = applyConfigDefaults(
      { skills: { default: null } },
      agentConfig,
    );

    expect(config).not.toBe(agentConfig);
    expect(agentConfig).toEqual({ model: 'gpt-4o' });
  });

  it('形状不符时按空对象处理，不抛错', () => {
    expect(applyConfigDefaults(null, null)).toEqual({});
    expect(applyConfigDefaults(['skills'], 'nope')).toEqual({});
    expect(applyConfigDefaults({ skills: 'nope' }, {})).toEqual({});
  });
});

describe('readAgentContext', () => {
  it('取 config_json.context', () => {
    expect(
      readAgentContext({ config_json: { context: { model: 'a' } } }),
    ).toEqual({ model: 'a' });
  });

  it('没有 context 时退回 config_json 本身', () => {
    expect(readAgentContext({ config_json: { model: 'a' } })).toEqual({
      model: 'a',
    });
  });

  it('形状不符时返回空对象', () => {
    expect(readAgentContext(null)).toEqual({});
    expect(readAgentContext({ config_json: null })).toEqual({});
    expect(readAgentContext({ config_json: { context: [] } })).toEqual({});
  });
});
