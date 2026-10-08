/**
 * 线程 state 的拉取。
 *
 * 上游 `fetchAgentState`（`AgentChatComponent.vue`）同时做三件事：拉 `/thread/{id}/state`、
 * 用请求版本号丢弃过期响应、在中断仍在当前 run 上时把它恢复成待处理项。
 * 轮询与终态各触发一次，重复的响应不能把界面写回旧状态。
 */
import { chatThreadApi } from '../api/agent-api';
import { extractPendingInterrupt } from '../lib/pending-interrupt';
import {
  getThreadRuntimeOrNull,
  notifyThreadRuntime,
} from './thread-runtime-store';

/** 每个线程的读取序号：只有最后一次读取的结果能落地。 */
const readGenerations = new Map<string, number>();

/**
 * 作废某线程在途的 state 读取。
 *
 * 两处必须调用：恢复中断与收到 `agent_state` 分片之前——否则已经过期的响应会把
 * 刚被消费掉的审批弹回界面，或把用量卡片回退到上一份快照（上游 `invalidateAgentStateRequest` 同语义）。
 */
export const invalidateAgentStateReads = (threadId: string): void => {
  readGenerations.set(threadId, (readGenerations.get(threadId) ?? 0) + 1);
};

export const fetchAgentState = async (threadId: string): Promise<void> => {
  if (!threadId) return;
  // 没有运行时说明这条线程已经不在页面上：不发请求，也不为它建状态
  if (!getThreadRuntimeOrNull(threadId)) return;

  const generation = (readGenerations.get(threadId) ?? 0) + 1;
  readGenerations.set(threadId, generation);

  try {
    const state = await chatThreadApi.getAgentState(threadId);
    if (readGenerations.get(threadId) !== generation) return;
    const runtime = getThreadRuntimeOrNull(threadId);
    if (!runtime) return;

    runtime.agentState = state.agent_state ?? null;
    const pending = extractPendingInterrupt(state.interrupt, threadId);
    // resume 已开始或 active run 已切换时，旧 checkpoint 的中断不能重新弹出来
    const interruptIsCurrent =
      pending !== null &&
      !runtime.isStreaming &&
      (!pending.interruptedRunId ||
        !runtime.activeRunId ||
        pending.interruptedRunId === runtime.activeRunId);
    if (interruptIsCurrent) {
      runtime.pendingInterrupt = pending;
    }
    notifyThreadRuntime(threadId);
  } catch (error) {
    // 状态拉取失败只影响用量与中断恢复，不打断正在进行的对话
    console.warn('Failed to fetch agent state:', threadId, error);
  }
};

/** 线程被丢弃时清掉它的读取序号，避免序号表无限增长。 */
export const disposeAgentStateReads = (threadId: string): void => {
  readGenerations.delete(threadId);
};
