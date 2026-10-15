import { describe, expect, it } from 'vitest';

import {
  canSubmitDirectSteer,
  describeQueue,
  describeQueueRow,
  hasPendingDirectSteer,
} from '@/features/chat/lib/queue-view';

const idle = {
  status: 'idle',
  paused_reason: null,
  blocking_run_id: null,
  can_continue: false,
};

const request = (request_id: string) => ({ request_id });

describe('describeQueue', () => {
  it('队列空闲且没有排队请求时不展示', () => {
    expect(describeQueue(idle, [])).toEqual({
      visible: false,
      pendingCount: 0,
      paused: false,
      pausedReason: null,
      canContinue: false,
    });
  });

  it('只有排队请求时展示，但不显示暂停原因', () => {
    const view = describeQueue(idle, [request('r-1'), request('r-2')]);
    expect(view.visible).toBe(true);
    expect(view.pendingCount).toBe(2);
    expect(view.paused).toBe(false);
  });

  it('后端 run 失败后的暂停：status=paused 且 paused_reason 是 Run 终态', () => {
    const view = describeQueue(
      {
        ...idle,
        status: 'paused',
        paused_reason: 'failed',
        can_continue: true,
      },
      [],
    );
    expect(view.paused).toBe(true);
    expect(view.visible).toBe(true);
    expect(view.pausedReason).toBe('上一次运行失败');
    expect(view.canContinue).toBe(true);
  });

  it('paused_reason 或 status=paused 都算暂停，interrupted 不算', () => {
    // 后端在 interrupted 时返回 paused_reason=null、can_continue=false
    const view = describeQueue({ ...idle, status: 'interrupted' }, []);
    expect(view.paused).toBe(false);
    expect(view.pausedReason).toBeNull();

    expect(
      describeQueue({ ...idle, paused_reason: 'cancelled' }, []).pausedReason,
    ).toBe('上一次运行已取消');
  });

  it('未知暂停原因原样透出，不吞掉后端新增的码', () => {
    expect(
      describeQueue(
        { ...idle, status: 'paused', paused_reason: 'brand_new' },
        [],
      ).pausedReason,
    ).toBe('brand_new');
  });

  it('can_continue 单独透传，供继续按钮判断可用性', () => {
    expect(describeQueue({ ...idle, can_continue: true }, []).canContinue).toBe(
      true,
    );
  });

  it('队列状态缺失时按空闲处理，不抛异常', () => {
    expect(describeQueue(null, null).visible).toBe(false);
    expect(describeQueue(undefined, undefined).pendingCount).toBe(0);
  });
});

const rowContext = {
  isStreaming: true,
  activeRunSteerable: true,
  hasPendingSteer: false,
  queueStatus: 'running',
};

const queuedRow = {
  request_id: 'req-1',
  status: 'queued',
  queue_policy: 'enqueue',
  source: 'chat',
};

describe('describeQueueRow', () => {
  it('运行中、可引导的普通排队请求可以引导也可以取消', () => {
    expect(describeQueueRow(queuedRow, rowContext)).toEqual({
      canSteer: true,
      canCancel: true,
    });
  });

  it('没有在收流、或活跃 run 不可引导时不能引导', () => {
    expect(
      describeQueueRow(queuedRow, { ...rowContext, isStreaming: false })
        .canSteer,
    ).toBe(false);
    expect(
      describeQueueRow(queuedRow, { ...rowContext, activeRunSteerable: false })
        .canSteer,
    ).toBe(false);
  });

  it('已有等待执行的引导请求时不能再提升第二条', () => {
    expect(
      describeQueueRow(queuedRow, { ...rowContext, hasPendingSteer: true })
        .canSteer,
    ).toBe(false);
  });

  it('非对话来源或非 queued 状态的请求不可引导', () => {
    expect(
      describeQueueRow({ ...queuedRow, source: 'api' }, rowContext).canSteer,
    ).toBe(false);
    expect(
      describeQueueRow({ ...queuedRow, status: 'dispatched' }, rowContext)
        .canSteer,
    ).toBe(false);
  });

  it('引导请求在运行中不可取消，运行结束后可以', () => {
    const steerRow = { ...queuedRow, queue_policy: 'steer' };

    expect(describeQueueRow(steerRow, rowContext).canCancel).toBe(false);
    expect(
      describeQueueRow(steerRow, {
        ...rowContext,
        isStreaming: false,
        queueStatus: 'paused',
      }).canCancel,
    ).toBe(true);
  });
});

const steerContext = {
  isStreaming: true,
  activeRunSteerable: true,
  hasInput: true,
  hasAgent: true,
  hasPendingSteer: false,
  isWaitingForUserAction: false,
};

describe('hasPendingDirectSteer', () => {
  it('只有等待执行的引导请求算数', () => {
    expect(
      hasPendingDirectSteer([
        { request_id: 'r-1', queue_policy: 'steer', status: 'queued' },
      ]),
    ).toBe(true);
  });

  it('已经派发过的引导不再挡住后续引导', () => {
    expect(
      hasPendingDirectSteer([
        { request_id: 'r-1', queue_policy: 'steer', status: 'dispatched' },
        { request_id: 'r-2', queue_policy: 'steer', status: 'completed' },
      ]),
    ).toBe(false);
  });

  it('普通排队请求不算引导', () => {
    expect(
      hasPendingDirectSteer([
        { request_id: 'r-1', queue_policy: 'enqueue', status: 'queued' },
      ]),
    ).toBe(false);
  });

  it('没有请求时返回 false', () => {
    expect(hasPendingDirectSteer([])).toBe(false);
    expect(hasPendingDirectSteer(null)).toBe(false);
    expect(hasPendingDirectSteer(undefined)).toBe(false);
  });
});

describe('canSubmitDirectSteer', () => {
  it('运行中、可引导、有输入时可以引导', () => {
    expect(canSubmitDirectSteer(steerContext)).toBe(true);
  });

  it('以下任一项不成立都不许引导', () => {
    const cases: Array<[string, Partial<typeof steerContext>]> = [
      ['不在流式中', { isStreaming: false }],
      ['活跃 run 不可引导', { activeRunSteerable: false }],
      ['输入为空', { hasInput: false }],
      ['线程还没绑定智能体', { hasAgent: false }],
      ['队列里已有等待执行的引导', { hasPendingSteer: true }],
      ['正在等用户处理审批或提问', { isWaitingForUserAction: true }],
    ];

    for (const [name, patch] of cases) {
      expect(canSubmitDirectSteer({ ...steerContext, ...patch }), name).toBe(
        false,
      );
    }
  });
});
