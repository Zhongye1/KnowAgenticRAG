import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AgentSteps } from '../agent-steps';

const runInfo = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock('../../hooks/use-chat-run-info', () => ({
  useChatRunInfo: () => runInfo.current,
}));

describe('AgentSteps', () => {
  it('非 agent 运行（无 agent 元数据）不渲染', () => {
    runInfo.current = { steps: [{ name: 'recall' }] };
    const { container } = render(<AgentSteps />);
    expect(container).toBeEmptyDOMElement();
  });

  it('折叠态给出摘要，展开后列出子查询、工具调用与逐步明细', async () => {
    const user = userEvent.setup();
    runInfo.current = {
      steps: [
        { name: 'plan', detail: 'need_retrieval=true' },
        { name: 'act', detail: 'tool_calls=2' },
        { name: 'grade', detail: 'score=0.42' },
      ],
      agent: {
        need_retrieval: true,
        sub_queries: ['营收确认规则', '收入准则条款'],
        plan_rationale: '问题涉及准则条款',
        grade_score: 0.42,
        rewrites: 1,
        tool_calls: 2,
        tool_calls_by_name: { search_knowledge: 1, read_document_chunks: 1 },
      },
    };
    render(<AgentSteps />);

    expect(screen.getByText(/子查询 2 · 3 步 · 改写 1 次 · 工具 2 次 · 相关度 0.42/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Agent ·/ }));

    expect(screen.getByText('问题涉及准则条款')).toBeInTheDocument();
    expect(screen.getByText('营收确认规则')).toBeInTheDocument();
    expect(screen.getByText('收入准则条款')).toBeInTheDocument();
    expect(screen.getByText(/search_knowledge × 1 · read_document_chunks × 1/)).toBeInTheDocument();
    expect(screen.getByText('plan')).toBeInTheDocument();
    expect(screen.getByText('score=0.42')).toBeInTheDocument();
  });
});
