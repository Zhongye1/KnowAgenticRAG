import { describe, expect, it } from 'vitest';

import { toAgents } from '@/entities/agent';
import {
  agentFormFrom,
  buildAgentCreatePayload,
  buildAgentUpdatePayload,
  emptyAgentForm,
  validateAgentForm,
} from '@/features/agents/lib/agent-form';

const agent = (raw: unknown) => toAgents([raw])[0]!;

describe('emptyAgentForm', () => {
  it('新建初值：后端可预选，其余留空', () => {
    expect(emptyAgentForm('chatbot')).toEqual({
      name: '',
      slug: '',
      backendId: 'chatbot',
      description: '',
      icon: '',
    });
  });
});

describe('agentFormFrom', () => {
  it('编辑初值来自当前那条', () => {
    expect(
      agentFormFrom(
        agent({
          slug: 'alpha',
          name: '甲',
          description: '描述',
          icon: '/i.png',
          backend_id: 'chatbot',
        }),
      ),
    ).toEqual({
      name: '甲',
      slug: 'alpha',
      backendId: 'chatbot',
      description: '描述',
      icon: '/i.png',
    });
  });
});

describe('validateAgentForm', () => {
  it('名称必填', () => {
    expect(validateAgentForm(emptyAgentForm('chatbot'))).toBe(
      '请填写智能体名称',
    );
  });

  it('后端必选', () => {
    expect(validateAgentForm({ ...emptyAgentForm(), name: '甲' })).toBe(
      '请选择智能体后端',
    );
  });

  it('齐全时通过', () => {
    expect(validateAgentForm(emptyAgentForm('chatbot'))).not.toBeNull();
    expect(
      validateAgentForm({ ...emptyAgentForm('chatbot'), name: '甲' }),
    ).toBeNull();
  });
});

describe('buildAgentCreatePayload', () => {
  it('留空的 slug 传 null 交给后端按名称生成，空描述与图标也传 null', () => {
    expect(
      buildAgentCreatePayload({ ...emptyAgentForm('chatbot'), name: ' 甲 ' }),
    ).toEqual({
      name: '甲',
      slug: null,
      backend_id: 'chatbot',
      description: null,
      icon: null,
    });
  });

  it('填了 slug 与描述就带上（去空白）', () => {
    expect(
      buildAgentCreatePayload({
        name: '甲',
        slug: ' alpha ',
        backendId: 'chatbot',
        description: ' 描述 ',
        icon: '',
      }),
    ).toEqual({
      name: '甲',
      slug: 'alpha',
      backend_id: 'chatbot',
      description: '描述',
      icon: null,
    });
  });

  it('不下发 is_subagent 与 share_config：后端自己推导与落默认值', () => {
    const payload = buildAgentCreatePayload({
      ...emptyAgentForm('chatbot'),
      name: '甲',
    });
    expect(payload).not.toHaveProperty('is_subagent');
    expect(payload).not.toHaveProperty('share_config');
  });
});

describe('buildAgentUpdatePayload', () => {
  it('只带可改字段：标识、后端与共享范围都不动', () => {
    const payload = buildAgentUpdatePayload({
      name: ' 甲二 ',
      slug: 'alpha',
      backendId: 'chatbot',
      description: ' 新描述 ',
      icon: '/new.png',
    });

    expect(payload).toEqual({
      name: '甲二',
      description: '新描述',
      icon: '/new.png',
    });
    expect(payload).not.toHaveProperty('slug');
    expect(payload).not.toHaveProperty('backend_id');
    expect(payload).not.toHaveProperty('share_config');
  });
});
