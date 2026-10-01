const RUN_SEQ_PATTERN = /^\d+-\d+$/;

/** resume 判定所需的线程状态投影，字段名来自流式运行时的前端状态。 */
export interface RunResumeThreadState {
  /** 当前正在流式产出的 run id。 */
  readonly activeRunId?: unknown;
  /** 当前线程已经处理到的序号。 */
  readonly runLastSeq?: unknown;
  readonly onGoingConv?: {
    readonly msgChunks?: Record<string, unknown>;
  } | null;
}

/** 后端给出的运行快照，字段名来自快照接口。 */
export interface RunSnapshot {
  readonly run_id?: unknown;
  readonly last_seq?: unknown;
}

/** 把任意输入规范化成 `毫秒-序号` 游标，缺失或非法时回落到 `0-0`。 */
export const normalizeRunSeq = (value: unknown): string => {
  if (value === undefined || value === null) return '0-0';
  const text = String(value).trim();
  return RUN_SEQ_PATTERN.test(text) ? text : '0-0';
};

const parseRunSeq = (value: unknown): { major: bigint; minor: bigint } => {
  const text = normalizeRunSeq(value);
  if (!text.includes('-')) {
    return { major: 0n, minor: 0n };
  }
  const [majorRaw, minorRaw] = text.split('-', 2);

  try {
    const major = BigInt(majorRaw || '0');
    const minor = BigInt(minorRaw || '0');
    return { major, minor };
  } catch {
    return { major: 0n, minor: 0n };
  }
};

/** 比较两个序号的先后，返回 1（incoming 更新）、-1（更旧）或 0（相同）。 */
export const compareRunSeq = (
  incoming: unknown,
  current: unknown,
): -1 | 0 | 1 => {
  const left = parseRunSeq(incoming);
  const right = parseRunSeq(current);

  if (left.major > right.major) return 1;
  if (left.major < right.major) return -1;
  if (left.minor > right.minor) return 1;
  if (left.minor < right.minor) return -1;
  return 0;
};

/** 判断线程状态里是否还残留未渲染完的分片，决定能否续传。 */
export const hasOngoingRunChunks = (
  threadState: RunResumeThreadState | null | undefined,
): boolean => {
  const msgChunks = threadState?.onGoingConv?.msgChunks;
  if (!msgChunks || typeof msgChunks !== 'object') return false;
  return Object.values(msgChunks).some((chunks) =>
    Array.isArray(chunks) ? chunks.length > 0 : Boolean(chunks),
  );
};

/**
 * 解析断线续传的起点序号。
 *
 * 只有快照存在、仍有未渲染分片、且快照对应的 run 就是当前活跃 run 时，
 * 才回到线程已处理的位置；否则一律从 `0-0` 重放。
 */
export const resolveRunResumeAfterSeq = ({
  snapshot,
  threadState,
}: {
  snapshot?: RunSnapshot | null;
  threadState?: RunResumeThreadState | null;
}): string => {
  if (!snapshot?.run_id || !hasOngoingRunChunks(threadState)) {
    return '0-0';
  }

  if (threadState?.activeRunId === snapshot.run_id) {
    return normalizeRunSeq(threadState.runLastSeq || snapshot.last_seq);
  }

  return '0-0';
};
