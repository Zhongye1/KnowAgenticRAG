/**
 * 队列状态的可读描述。
 *
 * 后端 `queue` 对象只有状态码与原因码，展示文案集中在这里，
 * 便于单测覆盖各种组合，也让组件保持无分支。
 */
import type { QueueState, ThreadRequest } from '../api/agent-api';
import { IDLE_QUEUE_SNAPSHOT } from '../model/thread-runtime-store';

/**
 * 暂停原因的展示文案。后端 `paused_reason` 取上一次 Run 的终态，
 * 只有失败与取消两种；未知取值原样展示，不吞掉后端新增的码。
 */
const PAUSED_REASON_LABELS: Record<string, string> = {
  failed: '上一次运行失败',
  cancelled: '上一次运行已取消',
};

export type QueueView = {
  /** 是否需要在界面上展示队列条。 */
  visible: boolean;
  /** 排队中的请求数。 */
  pendingCount: number;
  /** 队列是否处于暂停。 */
  paused: boolean;
  /** 暂停原因文案；未暂停时为 null。 */
  pausedReason: string | null;
  /** 是否允许用户手动继续。 */
  canContinue: boolean;
};

/** 把后端队列状态折叠成界面需要的几个布尔与文案。 */
export function describeQueue(
  queue: QueueState | null | undefined,
  requests: ThreadRequest[] | null | undefined,
): QueueView {
  const state = queue ?? IDLE_QUEUE_SNAPSHOT;
  const pendingCount = requests?.length ?? 0;
  const paused = state.status === 'paused' || Boolean(state.paused_reason);
  const reason = state.paused_reason ?? null;

  return {
    visible: pendingCount > 0 || paused,
    pendingCount,
    paused,
    pausedReason: reason ? (PAUSED_REASON_LABELS[reason] ?? reason) : null,
    canContinue: Boolean(state.can_continue),
  };
}

/** 单条排队请求的动作判定所依赖的线程状态。 */
export type QueueRowContext = {
  /** 该线程正在收流。 */
  isStreaming: boolean;
  /** 活跃 run 允许被引导。 */
  activeRunSteerable: boolean;
  /** 队列里已经有一条等待执行的引导请求，不能再提升第二条。 */
  hasPendingSteer: boolean;
  /** 队列快照状态；取消引导请求的可用性与它有关。 */
  queueStatus: string;
};

export type QueueRowActions = {
  canSteer: boolean;
  canCancel: boolean;
};

/** 只有运行中、可引导、来源是对话的普通排队请求能被提升。 */
export function describeQueueRow(
  request: ThreadRequest,
  context: QueueRowContext,
): QueueRowActions {
  return {
    canSteer:
      context.isStreaming &&
      context.activeRunSteerable &&
      !context.hasPendingSteer &&
      request.status === 'queued' &&
      request.queue_policy === 'enqueue' &&
      request.source === 'chat',
    // 引导请求在运行中不可取消
    canCancel:
      request.queue_policy !== 'steer' ||
      (!context.isStreaming && context.queueStatus !== 'running'),
  };
}
