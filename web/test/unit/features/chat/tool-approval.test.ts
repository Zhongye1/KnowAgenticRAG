import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  TOOL_APPROVAL_MODES,
  TOOL_APPROVAL_MODE_STORAGE_KEY,
  buildToolApprovalDecisions,
  formatToolApprovalArgs,
  getToolApprovalSummary,
  hasPendingInterruptPayload,
  isRunInterruptedConflict,
  isThreadWaitingForUserAction,
  isToolApprovalMode,
  readToolApprovalModePreference,
  resolveToolApprovalMode,
  writeToolApprovalModePreference,
  type ToolApprovalStorage,
} from '@/features/chat/lib/tool-approval';
import { ApiError } from '@/shared/api/base';

const createStorage = (stored: string | null = null) => {
  const calls: string[] = [];
  const storage: ToolApprovalStorage = {
    getItem: (key) => {
      calls.push(key);
      return stored;
    },
    setItem: (key, value) => {
      calls.push(`${key}=${value}`);
    },
  };
  return { calls, storage };
};

const throwingStorage: ToolApprovalStorage = {
  getItem: () => {
    throw new Error('storage denied');
  },
  setItem: () => {
    throw new Error('storage denied');
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('工具审批模式枚举', () => {
  it('与上游同值：枚举顺序即回退顺序，存储键保持同名', () => {
    expect(TOOL_APPROVAL_MODES).toEqual(['default', 'always_trust']);
    expect(TOOL_APPROVAL_MODE_STORAGE_KEY).toBe('ars_tool_approval_mode');
  });

  it('isToolApprovalMode 只认两个合法值', () => {
    expect(isToolApprovalMode('default')).toBe(true);
    expect(isToolApprovalMode('always_trust')).toBe(true);
    expect(isToolApprovalMode('unknown')).toBe(false);
  });

  it('isToolApprovalMode 对缺失值与非法类型一律判否', () => {
    for (const value of [
      'always',
      'DEFAULT',
      'always_trust ',
      '',
      null,
      undefined,
      0,
      false,
      {},
      [],
    ]) {
      expect(isToolApprovalMode(value)).toBe(false);
    }
  });
});

describe('resolveToolApprovalMode', () => {
  it('无线程时先取保存值，再取智能体默认值', () => {
    expect(
      resolveToolApprovalMode({
        hasThread: false,
        savedMode: 'always_trust',
        agentMode: 'default',
      }),
    ).toBe('always_trust');
    expect(
      resolveToolApprovalMode({ hasThread: false, agentMode: 'always_trust' }),
    ).toBe('always_trust');
  });

  it('有线程时只看线程模式，忽略保存值与智能体默认值', () => {
    expect(
      resolveToolApprovalMode({
        hasThread: true,
        threadMode: 'default',
        savedMode: 'always_trust',
        agentMode: 'always_trust',
      }),
    ).toBe('default');
  });

  it('有线程但线程模式缺失或非法时回退 default，而不是保存值', () => {
    expect(
      resolveToolApprovalMode({
        hasThread: true,
        savedMode: 'always_trust',
        agentMode: 'always_trust',
      }),
    ).toBe('default');
    expect(
      resolveToolApprovalMode({
        hasThread: true,
        threadMode: 'always',
        savedMode: 'always_trust',
      }),
    ).toBe('default');
  });

  it('候选值全非法或全缺失时回退枚举第一项', () => {
    expect(resolveToolApprovalMode({})).toBe('default');
    expect(
      resolveToolApprovalMode({
        hasThread: false,
        savedMode: 'nope',
        agentMode: undefined,
      }),
    ).toBe('default');
  });
});

describe('审批模式偏好读写', () => {
  it('读到合法值返回该值，并按上游键名查询', () => {
    const { calls, storage } = createStorage('always_trust');

    expect(readToolApprovalModePreference(storage)).toBe('always_trust');
    expect(calls).toEqual([TOOL_APPROVAL_MODE_STORAGE_KEY]);
  });

  it('存储内容非法或为空时返回 null，不抛错', () => {
    expect(
      readToolApprovalModePreference(createStorage('always').storage),
    ).toBeNull();
    expect(
      readToolApprovalModePreference(createStorage('').storage),
    ).toBeNull();
    expect(
      readToolApprovalModePreference(createStorage(null).storage),
    ).toBeNull();
  });

  it('读取抛错时返回 null，不抛错', () => {
    expect(readToolApprovalModePreference(throwingStorage)).toBeNull();
  });

  it('未传存储时读 window.localStorage，内容损坏同样回退 null', () => {
    window.localStorage.setItem(TOOL_APPROVAL_MODE_STORAGE_KEY, 'always_trust');
    expect(readToolApprovalModePreference()).toBe('always_trust');

    window.localStorage.setItem(TOOL_APPROVAL_MODE_STORAGE_KEY, 'yolo');
    expect(readToolApprovalModePreference()).toBeNull();
  });

  it('无 window（SSR）时读取返回 null', () => {
    vi.stubGlobal('window', undefined);

    expect(readToolApprovalModePreference()).toBeNull();
  });

  it('写入合法值返回 true 并落盘', () => {
    const { calls, storage } = createStorage();

    expect(writeToolApprovalModePreference('always_trust', storage)).toBe(true);
    expect(calls).toEqual([`${TOOL_APPROVAL_MODE_STORAGE_KEY}=always_trust`]);
  });

  it('模式非法时直接返回 false，且不触碰存储', () => {
    const { calls, storage } = createStorage();

    for (const mode of ['always', '', null, undefined, 1]) {
      expect(writeToolApprovalModePreference(mode, storage)).toBe(false);
    }
    expect(calls).toEqual([]);
  });

  it('写入抛错时返回 false，不抛错', () => {
    expect(
      writeToolApprovalModePreference('always_trust', throwingStorage),
    ).toBe(false);
  });

  it('无 window（SSR）时写入返回 false', () => {
    vi.stubGlobal('window', undefined);

    expect(writeToolApprovalModePreference('always_trust')).toBe(false);
  });
});

describe('buildToolApprovalDecisions', () => {
  it('按动作下标生成决定，未选中的一律拒绝（上游对象映射入参）', () => {
    expect(
      buildToolApprovalDecisions({ 0: 'approve', 1: 'reject' }, 2),
    ).toEqual([
      { type: 'approve' },
      { type: 'reject', message: '用户拒绝执行该操作' },
    ]);
  });

  it('下标缺失、错位或值非 approve 时都算拒绝', () => {
    expect(buildToolApprovalDecisions({}, 2)).toEqual([
      { type: 'reject', message: '用户拒绝执行该操作' },
      { type: 'reject', message: '用户拒绝执行该操作' },
    ]);
    expect(buildToolApprovalDecisions({ 2: 'approve' }, 2)).toEqual([
      { type: 'reject', message: '用户拒绝执行该操作' },
      { type: 'reject', message: '用户拒绝执行该操作' },
    ]);
    expect(buildToolApprovalDecisions({ 0: 'APPROVE' }, 1)).toEqual([
      { type: 'reject', message: '用户拒绝执行该操作' },
    ]);
  });

  it('动作数为 0 时返回空数组', () => {
    expect(buildToolApprovalDecisions({ 0: 'approve' }, 0)).toEqual([]);
  });
});

describe('formatToolApprovalArgs', () => {
  it('字符串原样返回，其余按两空格缩进序列化', () => {
    expect(formatToolApprovalArgs('ls -la')).toBe('ls -la');
    expect(formatToolApprovalArgs({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it('空值序列化为空对象', () => {
    expect(formatToolApprovalArgs(undefined)).toBe('{}');
    expect(formatToolApprovalArgs(null)).toBe('{}');
  });
});

describe('getToolApprovalSummary', () => {
  it('execute 取 command，缺失时取 cmd', () => {
    expect(
      getToolApprovalSummary({
        name: 'execute',
        args: JSON.stringify({ command: 'ls -la' }),
      }),
    ).toBe('ls -la');
    expect(
      getToolApprovalSummary({ name: 'execute', args: { cmd: 'pwd' } }),
    ).toBe('pwd');
  });

  it('execute 的 command 为空串时退回完整参数，而不是给空摘要', () => {
    expect(
      getToolApprovalSummary({ name: 'execute', args: { command: '' } }),
    ).toBe('{\n  "command": ""\n}');
  });

  it('write_file / edit_file 取文件路径', () => {
    expect(
      getToolApprovalSummary({
        name: 'write_file',
        args: { file_path: '/tmp/a.txt' },
      }),
    ).toBe('/tmp/a.txt');
    expect(
      getToolApprovalSummary({ name: 'edit_file', args: { path: 'a.txt' } }),
    ).toBe('a.txt');
  });

  it('其它工具把参数压缩成单行摘要', () => {
    expect(
      getToolApprovalSummary({ name: 'read_file', args: { a: 1, b: 'x  y' } }),
    ).toBe('{ "a": 1, "b": "x y" }');
  });

  it('字符串参数解析失败时原样返回', () => {
    expect(
      getToolApprovalSummary({ name: 'read_file', args: 'not json' }),
    ).toBe('not json');
  });

  it('JSON 字符串解析成字符串时原样返回', () => {
    expect(
      getToolApprovalSummary({ name: 'execute', args: '"just a string"' }),
    ).toBe('just a string');
  });

  it('非对象参数走 String 分支', () => {
    expect(getToolApprovalSummary({ name: 'execute', args: 42 })).toBe('42');
  });

  it('请求缺失或参数缺失时返回空对象摘要', () => {
    expect(getToolApprovalSummary({ name: 'execute' })).toBe('{}');
    expect(getToolApprovalSummary(null)).toBe('{}');
    expect(getToolApprovalSummary()).toBe('{}');
  });
});

describe('hasPendingInterruptPayload', () => {
  it('空值与畸形载荷判否', () => {
    for (const value of [null, undefined, 0, '', 'x', {}, { questions: 'x' }]) {
      expect(hasPendingInterruptPayload(value)).toBe(false);
    }
  });

  it('tool_approval 只看 actionRequests，空数组判否', () => {
    expect(
      hasPendingInterruptPayload({
        kind: 'tool_approval',
        actionRequests: [{}],
      }),
    ).toBe(true);
    expect(
      hasPendingInterruptPayload({ kind: 'tool_approval', actionRequests: [] }),
    ).toBe(false);
    expect(
      hasPendingInterruptPayload({
        kind: 'tool_approval',
        actionRequests: 'x',
      }),
    ).toBe(false);
    expect(
      hasPendingInterruptPayload({
        kind: 'tool_approval',
        actionRequests: [],
        questions: [{}],
      }),
    ).toBe(false);
  });

  it('非 tool_approval 一律看 questions', () => {
    expect(
      hasPendingInterruptPayload({ kind: 'question', questions: [{}] }),
    ).toBe(true);
    expect(
      hasPendingInterruptPayload({ kind: 'question', questions: [] }),
    ).toBe(false);
    expect(hasPendingInterruptPayload({ questions: [1] })).toBe(true);
  });
});

describe('isThreadWaitingForUserAction', () => {
  it('有中断载荷即视为等待用户', () => {
    expect(
      isThreadWaitingForUserAction({
        pendingInterrupt: { kind: 'question', questions: [{ id: 'q-1' }] },
      }),
    ).toBe(true);
  });

  it('队列快照为 interrupted 即视为等待用户', () => {
    expect(
      isThreadWaitingForUserAction({
        queueSnapshot: { status: 'interrupted' },
      }),
    ).toBe(true);
    expect(
      isThreadWaitingForUserAction({
        pendingInterrupt: {},
        queueSnapshot: { status: 'interrupted' },
      }),
    ).toBe(true);
  });

  it('空载荷与其它状态判否', () => {
    expect(isThreadWaitingForUserAction()).toBe(false);
    expect(isThreadWaitingForUserAction(null)).toBe(false);
    expect(isThreadWaitingForUserAction({})).toBe(false);
    expect(
      isThreadWaitingForUserAction({
        pendingInterrupt: null,
        queueSnapshot: { status: 'paused' },
      }),
    ).toBe(false);
    expect(
      isThreadWaitingForUserAction({
        pendingInterrupt: { kind: 'tool_approval', actionRequests: [] },
      }),
    ).toBe(false);
    expect(isThreadWaitingForUserAction({ queueSnapshot: null })).toBe(false);
    expect(
      isThreadWaitingForUserAction({
        queueSnapshot: { status: 'INTERRUPTED' },
      }),
    ).toBe(false);
  });
});

describe('isRunInterruptedConflict', () => {
  it('409 且 detail.code 为 run_interrupted 时判真', () => {
    expect(
      isRunInterruptedConflict(
        new ApiError(409, {
          code: 'run_interrupted',
          message: '线程正在等待用户回答或审批',
        }),
      ),
    ).toBe(true);
  });

  it('普通 Error 与空值判否', () => {
    expect(
      isRunInterruptedConflict(new Error('线程正在等待用户回答或审批')),
    ).toBe(false);
    expect(isRunInterruptedConflict(null)).toBe(false);
    expect(isRunInterruptedConflict(undefined)).toBe(false);
  });

  it('状态码或错误码不匹配时判否', () => {
    expect(isRunInterruptedConflict(new ApiError(409, {}))).toBe(false);
    expect(isRunInterruptedConflict(new ApiError(409, { code: 'other' }))).toBe(
      false,
    );
    expect(
      isRunInterruptedConflict(new ApiError(500, { code: 'run_interrupted' })),
    ).toBe(false);
    expect(isRunInterruptedConflict(new ApiError(409, null))).toBe(false);
  });
});
