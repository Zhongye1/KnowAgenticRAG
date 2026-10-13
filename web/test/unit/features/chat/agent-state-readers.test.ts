import { describe, expect, it } from 'vitest';

import {
  formatTodoName,
  hasVisibleStateSections,
  readAgentStateArtifacts,
  readAgentStateFiles,
  readAgentStateSubagentRuns,
  readAgentStateTodos,
  todoStatusLabel,
} from '@/features/chat/lib/agent-state-readers';

describe('readAgentStateTodos', () => {
  it('读取 content 与状态白名单', () => {
    const todos = readAgentStateTodos({
      todos: [
        { content: '写报告', status: 'in_progress' },
        { content: '发邮件', status: 'completed' },
      ],
    });
    expect(todos).toHaveLength(2);
    expect(todos[0]).toMatchObject({ label: '写报告', status: 'in_progress' });
  });

  it('未登记状态归到 unknown 而不是「待处理」', () => {
    const todos = readAgentStateTodos({
      todos: [{ content: '神秘任务', status: 'weird' }],
    });
    expect(todos[0].status).toBe('unknown');
    expect(todoStatusLabel('weird')).toBe('状态未知');
  });

  it('丢弃缺 content 的条目与非数组输入', () => {
    expect(readAgentStateTodos({ todos: [{ status: 'pending' }, 'x'] })).toEqual([]);
    expect(readAgentStateTodos(null)).toEqual([]);
    expect(readAgentStateTodos({ todos: 'no' })).toEqual([]);
  });

  it('展示名截到 60 字符，完整内容留在 title', () => {
    const long = '字'.repeat(80);
    const todos = readAgentStateTodos({ todos: [{ content: long, status: 'pending' }] });
    expect(todos[0].label).toHaveLength(60);
    expect(todos[0].title).toHaveLength(80);
  });
});

describe('readAgentStateFiles', () => {
  it('从 Record<path, 元数据> 读取并去重，附件并入', () => {
    const files = readAgentStateFiles(
      { files: { '/out/a.md': { file_name: 'a.md' }, '/out/b.txt': {} } },
      [{ path: '/out/a.md', name: 'a.md' }, { path: '/tmp/up.bin' }],
    );
    expect(files).toHaveLength(3);
    expect(files[0]).toEqual({ key: '/out/a.md', path: '/out/a.md', name: 'a.md' });
    // 附件没有元数据名时用「附件」兜底
    expect(files[2].name).toBe('附件');
  });

  it('files 不是对象时只剩附件', () => {
    const files = readAgentStateFiles({ files: 'no' }, [{ path: '/tmp/x' }]);
    expect(files).toHaveLength(1);
    expect(readAgentStateFiles(null)).toEqual([]);
  });
});

describe('readAgentStateArtifacts', () => {
  it('过滤非字符串与空白', () => {
    expect(
      readAgentStateArtifacts({ artifacts: ['/out/a.md', '  ', 42, '/out/b.md'] }),
    ).toEqual(['/out/a.md', '  ', '/out/b.md'].filter((p) => typeof p === 'string' && p.trim()));
  });

  it('缺失与非对象返回空数组', () => {
    expect(readAgentStateArtifacts({})).toEqual([]);
    expect(readAgentStateArtifacts('x')).toEqual([]);
  });
});

describe('readAgentStateSubagentRuns', () => {
  it('直通 readSubagentRuns 的读取口径', () => {
    const runs = readAgentStateSubagentRuns({
      subagent_runs: [{ run_id: 'r1', child_thread_id: 't1', status: 'running' }],
    });
    expect(runs).toHaveLength(1);
    expect(readAgentStateSubagentRuns({ subagent_runs: [{ run_id: 'r1' }] })).toEqual([]);
  });
});

describe('hasVisibleStateSections', () => {
  it('四个集合全空才是空态', () => {
    expect(
      hasVisibleStateSections({ todos: [], files: [], artifacts: [], subagentRuns: [] }),
    ).toBe(false);
    expect(
      hasVisibleStateSections({
        todos: [{ label: 'x', title: 'x', status: 'pending' }],
        files: [],
        artifacts: [],
        subagentRuns: [],
      }),
    ).toBe(true);
  });
});

describe('formatTodoName', () => {
  it('按字符截断不产生半个代理对', () => {
    // Array.from 按码点切：上限 60 个码点；emoji 占 2 码元，不会留下半个代理对
    const truncated = formatTodoName('😀'.repeat(80));
    expect(Array.from(truncated)).toHaveLength(60);
    expect(truncated).toHaveLength(120); // 60 emoji × 2 码元
    expect(formatTodoName('😀'.repeat(40))).toHaveLength(80); // 40 码点没超限
    expect(formatTodoName('字'.repeat(80))).toHaveLength(60); // BMP 字符按个数截
  });
});
