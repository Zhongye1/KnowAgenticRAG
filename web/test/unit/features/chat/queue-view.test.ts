import { describe, expect, it } from 'vitest';

import {
  describeQueue,
  describeQueueRow,
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
    const view = describeQueue({ ...idle, status: 'paused', paused_reason: 'failed', can_continue: true }, []);
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

    expect(describeQueue({ ...idle, paused_reason: 'cancelled' }, []).pausedReason).toBe(
      '上一次运行已取消',
    );
  });

  it('未知暂停原因原样透出，不吞掉后端新增的码', () => {
    expect(
      describeQueue({ ...idle, status: 'paused', paused_reason: 'brand_new' }, [])
        .pausedReason,
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
      describeQueueRow(queuedRow, { ...rowContext, isStreaming: false }).canSteer,
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
