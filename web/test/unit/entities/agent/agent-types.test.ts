import { describe, expect, it } from 'vitest';

import { toAgent, toAgents } from '@/entities/agent';

describe('toAgent', () => {
  it('标识取 slug 而不是自增 id', () => {
    expect(toAgent({ id: 12, slug: 'assistant', name: '助手' })?.slug).toBe(
      'assistant',
    );
  });

  it('缺 slug 的条目丢掉：没有它既下发不了也跳不过去', () => {
    expect(toAgent({ id: 12, name: '无标识' })).toBeNull();
    expect(toAgent(null)).toBeNull();
    expect(toAgent('x')).toBeNull();
    expect(toAgent([])).toBeNull();
  });

  it('名称缺失时退到 slug', () => {
    expect(toAgent({ slug: 'x' })?.name).toBe('x');
  });

  it('读出后端、内置、子智能体与可管理标记', () => {
    expect(
      toAgent({
        slug: 'a',
        name: 'A',
        icon: '/i.png',
        backend_id: 'chatbot',
        is_builtin: true,
        is_subagent: true,
        can_manage: true,
      }),
    ).toMatchObject({
      icon: '/i.png',
      backendId: 'chatbot',
      isBuiltin: true,
      isSubagent: true,
      canManage: true,
    });
  });

  it('共享范围按原文保留；缺失或形状不对时为 null', () => {
    expect(
      toAgent({
        slug: 'a',
        share_config: { version: 2, read_scope: { access_level: 'global' } },
      })?.shareConfig,
    ).toEqual({ version: 2, read_scope: { access_level: 'global' } });
    expect(toAgent({ slug: 'a' })?.shareConfig).toBeNull();
    expect(toAgent({ slug: 'a', share_config: 'x' })?.shareConfig).toBeNull();
  });

  it('不把缺失的读范围补成全局共享', () => {
    // 后端对没设共享范围的智能体给的是 read_scope: null；补默认值会把私有显示成全局
    expect(
      toAgent({ slug: 'a', share_config: { version: 2, read_scope: null } })
        ?.shareConfig,
    ).toEqual({ version: 2, read_scope: null });
  });
});

describe('toAgents', () => {
  it('形状不符时返回空数组', () => {
    expect(toAgents(null)).toEqual([]);
    expect(toAgents('x')).toEqual([]);
    expect(toAgents({ agents: [] })).toEqual([]);
  });

  it('丢掉缺标识的条目，其余按原顺序保留', () => {
    expect(
      toAgents([{ name: '无标识' }, { slug: 'b' }, { slug: 'c' }]).map(
        (agent) => agent.slug,
      ),
    ).toEqual(['b', 'c']);
  });
});
