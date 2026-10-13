import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import type { ChatToolCall } from '@/features/chat/api/agent-api';
import { SubagentLifecycleRow } from '@/features/chat/ui/subagent-lifecycle-row';
import { SubagentTaskRow } from '@/features/chat/ui/subagent-task-row';

const taskCall = (overrides: Partial<ChatToolCall> = {}): ChatToolCall => ({
  id: 'task-1',
  name: 'task',
  args: { description: '帮我调研一下', subagent_slug: 'researcher' },
  ...overrides,
});

describe('SubagentTaskRow', () => {
  it('渲染名字与描述，运行中带状态标记', () => {
    render(<SubagentTaskRow toolCall={taskCall()} />);
    expect(screen.getByText('researcher')).toBeInTheDocument();
    expect(screen.getByText('帮我调研一下')).toBeInTheDocument();
  });

  it('展开后显示描述与结果正文', () => {
    render(
      <SubagentTaskRow
        toolCall={taskCall({ tool_call_result: { content: '调研结论' } })}
      />,
    );
    fireEvent.click(screen.getByLabelText(/子智能体 researcher/));
    expect(screen.getByText('调研结论')).toBeInTheDocument();
  });

  it('失败运行显示失败标签', () => {
    render(
      <SubagentTaskRow
        toolCall={taskCall({
          tool_call_result: { content: JSON.stringify({ status: 'failed' }) },
        })}
      />,
    );
    expect(screen.getByLabelText(/子智能体 researcher 失败/)).toBeInTheDocument();
  });
});

describe('SubagentLifecycleRow', () => {
  it('渲染动作、状态与细节', () => {
    render(
      <SubagentLifecycleRow
        toolCall={{
          id: 's1',
          name: 'subagent_start',
          args: { subagent_slug: 'writer' },
          tool_call_result: {
            content: JSON.stringify({
              subagent_name: '写手',
              run_status: 'running',
              message: '已启动',
            }),
          },
        }}
      />,
    );
    expect(screen.getByText('启动子智能体: 写手')).toBeInTheDocument();
    expect(screen.getByText('运行中')).toBeInTheDocument();
    expect(screen.getByText('已启动')).toBeInTheDocument();
  });

  it('展开后显示元信息表', () => {
    render(
      <SubagentLifecycleRow
        toolCall={{
          id: 's2',
          name: 'subagent_status',
          args: {},
          tool_call_result: {
            content: JSON.stringify({
              run_id: 'r9',
              thread_id: 't9',
            }),
          },
        }}
      />,
    );
    fireEvent.click(screen.getByLabelText(/查询子智能体/));
    expect(screen.getByText('run_id')).toBeInTheDocument();
    expect(screen.getByText('r9')).toBeInTheDocument();
    expect(screen.getByText('t9')).toBeInTheDocument();
  });

  it('失败状态渲染失败色', () => {
    render(
      <SubagentLifecycleRow
        toolCall={{
          id: 's3',
          name: 'subagent_await',
          args: {},
          tool_call_result: {
            content: JSON.stringify({ run_status: 'failed' }),
          },
        }}
      />,
    );
    expect(screen.getByText('失败')).toBeInTheDocument();
  });
});
