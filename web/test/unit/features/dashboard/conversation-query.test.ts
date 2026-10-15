/**
 * 会话审计表的筛选与分页参数用例。
 *
 * 这是「界面改了什么 → 真的发了什么请求」的事实 Owner：关键词去空白、
 * 空筛选不下发空串、`offset` 由页码推出、空结果也算 1 页。
 */
import { describe, expect, it } from 'vitest';

import {
  CONVERSATION_FILTER_DEFAULTS,
  DEFAULT_CONVERSATION_PAGE_SIZE,
  buildConversationQuery,
  conversationPageCount,
  conversationStatusLabel,
  hasActiveConversationFilters,
} from '@/features/dashboard/lib/conversation-query';

describe('请求参数组装', () => {
  it('offset 由页码与页长推出（第 1 页从 0 开始）', () => {
    // 变异：offset 写成 page * pageSize 会让第 1 页跳过前 10 条
    expect(
      buildConversationQuery(CONVERSATION_FILTER_DEFAULTS, 1, 10).offset,
    ).toBe(0);
    expect(
      buildConversationQuery(CONVERSATION_FILTER_DEFAULTS, 3, 20).offset,
    ).toBe(40);
    expect(
      buildConversationQuery(CONVERSATION_FILTER_DEFAULTS, 0, 10).offset,
    ).toBe(0);
    expect(
      buildConversationQuery(CONVERSATION_FILTER_DEFAULTS, 1, 10).limit,
    ).toBe(10);
  });

  it('关键词去空白；为空时不下发 search 与筛选项', () => {
    // 变异：不去 trim 会把纯空格当成关键字发给后端
    expect(
      buildConversationQuery(
        { ...CONVERSATION_FILTER_DEFAULTS, search: '  会话  ' },
        1,
        10,
      ),
    ).toMatchObject({ search: '会话' });
    expect(
      buildConversationQuery(
        { ...CONVERSATION_FILTER_DEFAULTS, search: '   ' },
        1,
        10,
      ),
    ).toMatchObject({ search: undefined });
    expect(
      buildConversationQuery(CONVERSATION_FILTER_DEFAULTS, 1, 10),
    ).toMatchObject({
      agent_id: undefined,
      uid: undefined,
    });
  });

  it('状态筛选原样下发，空字符串的智能体与用户不下发', () => {
    const query = buildConversationQuery(
      { status: 'deleted', search: '', agentId: 'default-chatbot', uid: '' },
      2,
      50,
    );
    expect(query).toEqual({
      status: 'deleted',
      search: undefined,
      agent_id: 'default-chatbot',
      uid: undefined,
      limit: 50,
      offset: 50,
    });
  });

  it('默认页长与默认筛选是一份可复用的常量', () => {
    expect(DEFAULT_CONVERSATION_PAGE_SIZE).toBe(10);
    expect(CONVERSATION_FILTER_DEFAULTS).toEqual({ status: 'all', search: '' });
  });
});

describe('页数', () => {
  it('向上取整；0 条也算 1 页', () => {
    // 变异：去掉 Math.max(1, ...) 会让空结果的分页控件落到 0/0 页
    expect(conversationPageCount(0, 10)).toBe(1);
    expect(conversationPageCount(10, 10)).toBe(1);
    expect(conversationPageCount(11, 10)).toBe(2);
    expect(conversationPageCount(27, 10)).toBe(3);
  });
});

describe('状态文案', () => {
  it('已知状态用中文，未知状态原样回显而不是显示 undefined', () => {
    // 变异：缺省分支回 '未知' 会丢掉后端新状态的信息
    expect(conversationStatusLabel('active')).toBe('进行中');
    expect(conversationStatusLabel('archived')).toBe('已归档');
    expect(conversationStatusLabel('deleted')).toBe('已删除');
    expect(conversationStatusLabel('subagent')).toBe('子智能体');
    expect(conversationStatusLabel('paused')).toBe('paused');
  });
});

describe('筛选生效判定', () => {
  it('只有关键词、状态或实体筛选非默认时才算有筛选', () => {
    // 变异：不 trim 会让一次空格的输入点亮「重置」
    expect(hasActiveConversationFilters(CONVERSATION_FILTER_DEFAULTS)).toBe(
      false,
    );
    expect(
      hasActiveConversationFilters({
        ...CONVERSATION_FILTER_DEFAULTS,
        search: '  ',
      }),
    ).toBe(false);
    expect(
      hasActiveConversationFilters({
        ...CONVERSATION_FILTER_DEFAULTS,
        search: 'a',
      }),
    ).toBe(true);
    expect(
      hasActiveConversationFilters({
        ...CONVERSATION_FILTER_DEFAULTS,
        status: 'deleted',
      }),
    ).toBe(true);
    expect(
      hasActiveConversationFilters({
        ...CONVERSATION_FILTER_DEFAULTS,
        agentId: 'x',
      }),
    ).toBe(true);
    expect(
      hasActiveConversationFilters({
        ...CONVERSATION_FILTER_DEFAULTS,
        uid: 'u',
      }),
    ).toBe(true);
  });
});
