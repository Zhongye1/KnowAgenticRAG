/**
 * 工具审批模式与待审批中断的纯逻辑。
 *
 * 模式枚举、缺失与非法值的回退顺序、localStorage 读写失败的容错、畸形中断载荷的判定。
 */

/** 工具审批模式枚举，顺序即优先级，第一项是回退值。 */
export const TOOL_APPROVAL_MODES = ['default', 'always_trust'] as const;

/** 审批模式偏好的 localStorage 键名。 */
export const TOOL_APPROVAL_MODE_STORAGE_KEY = 'ars_tool_approval_mode';

/** 合法的工具审批模式。 */
export type ToolApprovalMode = (typeof TOOL_APPROVAL_MODES)[number];

/** 判断任意值是否为合法的工具审批模式。 */
export const isToolApprovalMode = (value: unknown): value is ToolApprovalMode =>
  TOOL_APPROVAL_MODES.includes(value as ToolApprovalMode);

/** 审批偏好用的最小存储形状；默认取 `window.localStorage`。 */
export interface ToolApprovalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 解析审批模式时用到的候选值：线程态优先，无线程时先保存值再智能体默认值。 */
export interface ResolveToolApprovalModeInput {
  hasThread?: boolean;
  threadMode?: unknown;
  agentMode?: unknown;
  savedMode?: unknown;
}

const resolveStorage = (
  storage?: ToolApprovalStorage | null,
): ToolApprovalStorage | null =>
  storage || (typeof window !== 'undefined' ? window.localStorage : null);

/** 解析当前生效的审批模式：候选值都非法时回退到 `default`。 */
export const resolveToolApprovalMode = ({
  hasThread,
  threadMode,
  agentMode,
  savedMode,
}: ResolveToolApprovalModeInput): ToolApprovalMode => {
  const candidates = hasThread ? [threadMode] : [savedMode, agentMode];
  return candidates.find(isToolApprovalMode) || TOOL_APPROVAL_MODES[0];
};

/** 读取本地保存的审批模式；存储不可用、读取抛错或值非法时返回 null。 */
export const readToolApprovalModePreference = (
  storage?: ToolApprovalStorage | null,
): ToolApprovalMode | null => {
  const targetStorage = resolveStorage(storage);
  if (!targetStorage) return null;

  try {
    const value = targetStorage.getItem(TOOL_APPROVAL_MODE_STORAGE_KEY);
    return isToolApprovalMode(value) ? value : null;
  } catch {
    return null;
  }
};

/** 写入审批模式偏好；模式非法、存储不可用或写入抛错时返回 false。 */
export const writeToolApprovalModePreference = (
  mode: unknown,
  storage?: ToolApprovalStorage | null,
): boolean => {
  if (!isToolApprovalMode(mode)) return false;
  const targetStorage = resolveStorage(storage);
  if (!targetStorage) return false;

  try {
    targetStorage.setItem(TOOL_APPROVAL_MODE_STORAGE_KEY, mode);
    return true;
  } catch {
    return false;
  }
};

/** 单个动作的审批决定：通过，或带拒绝文案。 */
export type ToolApprovalDecision =
  { type: 'approve' } | { type: 'reject'; message: string };

/** 逐项选择结果：按动作下标记录 approve 或 reject。 */
export type ToolApprovalSelections = Readonly<Record<number, unknown>>;

/** 按动作数量逐项生成审批决定：选中 approve 的通过，其余一律拒绝。 */
export const buildToolApprovalDecisions = (
  selectedDecisions: ToolApprovalSelections,
  actionCount: number,
): ToolApprovalDecision[] =>
  Array.from({ length: actionCount }, (_, index): ToolApprovalDecision =>
    selectedDecisions[index] === 'approve'
      ? { type: 'approve' }
      : { type: 'reject', message: '用户拒绝执行该操作' },
  );

/** 把工具参数格式化成展示文本：字符串原样返回，其余按两空格缩进序列化。 */
export const formatToolApprovalArgs = (args: unknown): string =>
  typeof args === 'string' ? args : JSON.stringify(args ?? {}, null, 2);

const parseToolApprovalArgs = (args: unknown): unknown => {
  if (typeof args !== 'string') return args ?? {};

  try {
    return JSON.parse(args);
  } catch {
    return args;
  }
};

/** 审批请求的最小形状：`name` 决定摘要优先取哪个参数字段。 */
export interface ToolApprovalRequest {
  name?: unknown;
  args?: unknown;
}

/** 生成审批摘要：execute 取命令、写文件取路径，其余压缩空白后展示参数。 */
export const getToolApprovalSummary = (
  request?: ToolApprovalRequest | null,
): string => {
  const name = request?.name;
  const args = parseToolApprovalArgs(request?.args);

  if (typeof args === 'string') return args;
  if (args === null || typeof args !== 'object') return String(args ?? '');
  const record = args as Record<string, unknown>;
  if (name === 'execute') {
    return String(record.command || record.cmd || formatToolApprovalArgs(args));
  }
  if (name === 'write_file' || name === 'edit_file') {
    return String(
      record.file_path || record.path || formatToolApprovalArgs(args),
    );
  }

  return formatToolApprovalArgs(args).replace(/\s+/g, ' ').trim();
};

/** 待审批中断载荷：`kind` 为 tool_approval 时看 actionRequests，否则看 questions。 */
export interface PendingInterruptLike {
  kind?: string;
  actionRequests?: unknown;
  questions?: unknown;
  source?: string;
  status?: string;
  threadId?: string;
  interruptedRunId?: string | null;
}

/** 判断待审批中断载荷里是否有可展示的审批项或问题。 */
export const hasPendingInterruptPayload = (
  pendingInterrupt: unknown,
): boolean => {
  if (!pendingInterrupt) return false;
  const payload = pendingInterrupt as PendingInterruptLike;
  if (payload.kind === 'tool_approval') {
    return (
      Array.isArray(payload.actionRequests) && payload.actionRequests.length > 0
    );
  }
  return Array.isArray(payload.questions) && payload.questions.length > 0;
};

/** 线程态里与“等待用户动作”相关的部分。 */
export interface ThreadWaitingStateLike {
  pendingInterrupt?: unknown;
  queueSnapshot?: { status?: string } | null;
}

/** 判断线程是否在等用户处理：有中断载荷，或队列快照为 interrupted。 */
export const isThreadWaitingForUserAction = (
  threadState?: ThreadWaitingStateLike | null,
): boolean =>
  hasPendingInterruptPayload(threadState?.pendingInterrupt) ||
  threadState?.queueSnapshot?.status === 'interrupted';

/** 统一的 `ApiError` 里与本判定相关的投影；结构化判定避免依赖具体错误类。 */
interface RunInterruptedConflictLike {
  status?: number;
  detail?: { code?: string } | null;
}

/**
 * 判断错误是否为后端返回的 409 `run_interrupted` 冲突。
 *
 * `detail` 由 `agent-api` 的两条请求路径对齐成后端 detail 本体。
 */
export const isRunInterruptedConflict = (error: unknown): boolean => {
  const conflict = error as RunInterruptedConflictLike | null | undefined;
  return (
    conflict?.status === 409 && conflict?.detail?.code === 'run_interrupted'
  );
};
