import { describe, expect, it } from 'vitest';

import { toAgents } from '@/entities/agent';
import {
  agentShareLabel,
  agentStats,
  filterAgents,
  groupAgents,
  sortAgents,
} from '@/features/agents/lib/agent-view';

const agents = (raw: unknown) => toAgents(raw);

const SAMPLE = agents([
  { slug: 'zeta', name: '乙', backend_id: 'chatbot' },
  { slug: 'alpha', name: '甲', is_builtin: true, can_manage: false },
  {
    slug: 'worker',
    name: '丙',
    is_subagent: true,
    share_config: { read_scope: { access_level: 'global' } },
  },
]);

describe('filterAgents', () => {
  it('空关键词原样返回', () => {
    expect(filterAgents(SAMPLE, '  ')).toHaveLength(3);
  });

  it('名称、标识、后端任一命中', () => {
    expect(filterAgents(SAMPLE, '甲').map((a) => a.slug)).toEqual(['alpha']);
    expect(filterAgents(SAMPLE, 'ZETA').map((a) => a.slug)).toEqual(['zeta']);
    expect(filterAgents(SAMPLE, 'chatbot').map((a) => a.slug)).toEqual([
      'zeta',
    ]);
  });

  it('没有命中时是空数组', () => {
    expect(filterAgents(SAMPLE, 'zzz')).toEqual([]);
  });
});

describe('sortAgents', () => {
  it('内置优先，其次按名称', () => {
    expect(sortAgents(SAMPLE).map((a) => a.slug)).toEqual([
      'alpha',
      'worker',
      'zeta',
    ]);
  });

  it('不改动入参', () => {
    const before = SAMPLE.map((a) => a.slug);
    sortAgents(SAMPLE);
    expect(SAMPLE.map((a) => a.slug)).toEqual(before);
  });
});

describe('groupAgents', () => {
  it('按智能体 / 子智能体分组，空组不出现', () => {
    const groups = groupAgents(SAMPLE);
    expect(groups.map((group) => group.key)).toEqual(['agents', 'subagents']);
    expect(groups[0]?.agents.map((a) => a.slug)).toEqual(['alpha', 'zeta']);
    expect(groups[1]?.agents.map((a) => a.slug)).toEqual(['worker']);
  });

  it('只有智能体时只剩一组', () => {
    expect(groupAgents(agents([{ slug: 'a' }])).map((g) => g.key)).toEqual([
      'agents',
    ]);
  });
});

describe('agentStats', () => {
  it('统计总数、内置、可管理与全局共享', () => {
    expect(agentStats(SAMPLE)).toEqual({
      total: 3,
      builtin: 1,
      manageable: 0,
      global: 1,
    });
  });
});

describe('agentShareLabel', () => {
  it('只设读范围时是「只读X」', () => {
    const label = (raw: unknown) => agentShareLabel(agents([raw])[0]!);

    expect(
      label({
        slug: 'a',
        share_config: { read_scope: { access_level: 'global' } },
      }),
    ).toBe('只读全局');
    expect(
      label({
        slug: 'a',
        share_config: {
          read_scope: { access_level: 'department', department_ids: [7] },
        },
      }),
    ).toBe('只读部门(1)');
    expect(
      label({
        slug: 'a',
        share_config: {
          read_scope: { access_level: 'user', user_uids: ['u1', 'u2'] },
        },
      }),
    ).toBe('只读用户(2)');
  });

  it('读与管都设了时是「读X · 管Y」', () => {
    expect(
      agentShareLabel(
        agents([
          {
            slug: 'a',
            share_config: {
              read_scope: { access_level: 'global' },
              manage_scope: { access_level: 'user', user_uids: ['u1'] },
            },
          },
        ])[0]!,
      ),
    ).toBe('读全局 · 管用户(1)');
  });

  it('没有共享配置或没设读范围时是「仅所有者」，不是全局共享', () => {
    // 后端对没设共享范围的智能体给 read_scope: null；当成全局会把私有显示成共享
    expect(agentShareLabel(SAMPLE[0]!)).toBe('仅所有者');
    expect(
      agentShareLabel(
        agents([
          { slug: 'a', share_config: { version: 2, read_scope: null } },
        ])[0]!,
      ),
    ).toBe('仅所有者');
  });
});
