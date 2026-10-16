/**
 * `agent_state` 的类型化读取。
 *
 * 契约里的 `ThreadAgentState` 已声明 `todos / files / artifacts / subagent_runs / token_usage`
 * 五个字段，但它们的元素仍是自由结构（`Array<{[key: string]: unknown}>`）；这里按不可信数据
 * 逐字段读取，读不到显式降级为空集合，不猜也不渲染成假数据。
 */
import type { SubagentRun } from './subagent-run';
import { readSubagentRuns } from './subagent-run';
import type { TodoItem } from './todo-list';

/** agent_state 里的一条文件；附件与工作区文件共用这个形状。 */
export type AgentStateFile = {
  key: string;
  path: string;
  name: string;
};

const nonEmptyString = (value: unknown): string =>
  typeof value === 'string' && value.trim() ? value : '';

const TODO_NAME_MAX_LENGTH = 60;

/** 待办的展示名：按字符截断。 */
export function formatTodoName(content: unknown): string {
  return Array.from(String(content || ''))
    .slice(0, TODO_NAME_MAX_LENGTH)
    .join('');
}

const TODO_STATUSES = new Set(['completed', 'in_progress', 'pending']);

/** 待办状态的无障碍文案；未登记状态不猜。 */
export function todoStatusLabel(status: unknown): string {
  const normalized = nonEmptyString(status);
  if (normalized === 'completed') return '已完成';
  if (normalized === 'in_progress') return '进行中';
  if (normalized === 'pending') return '待处理';
  return '状态未知';
}

/** `agent_state.todos`；条目缺 content 的丢弃，状态不在白名单里标记为未知。 */
export function readAgentStateTodos(agentState: unknown): TodoItem[] {
  if (typeof agentState !== 'object' || agentState === null) return [];
  const raw = (agentState as { todos?: unknown }).todos;
  if (!Array.isArray(raw)) return [];

  const items: TodoItem[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const fullContent = nonEmptyString(record.content);
    if (!fullContent) continue;
    const status = nonEmptyString(record.status);
    items.push({
      label: formatTodoName(fullContent),
      title: fullContent,
      status: TODO_STATUSES.has(status)
        ? (status as TodoItem['status'])
        : // 未登记状态归到 unknown 外观，不渲染成「待处理」
          ('unknown' as TodoItem['status']),
    });
  }
  return items;
}

/** `agent_state.files`：后端给的是 `Record<path, 文件元数据>`；附件列表并进同一份，路径去重，附件在前。 */
export function readAgentStateFiles(
  agentState: unknown,
  attachments: Array<{ path?: string; name?: string }> = [],
): AgentStateFile[] {
  const files: AgentStateFile[] = [];
  const seenPaths = new Set<string>();
  const pushFile = (
    entry: {
      path?: unknown;
      file_path?: unknown;
      file_name?: unknown;
      name?: unknown;
    },
    fallbackName = '文件',
  ) => {
    const path =
      nonEmptyString(entry.path) ||
      nonEmptyString(entry.file_path) ||
      nonEmptyString(entry.file_name) ||
      nonEmptyString(entry.name);
    if (!path || seenPaths.has(path)) return;
    seenPaths.add(path);
    files.push({
      key: path,
      path,
      name:
        nonEmptyString(entry.file_name) ||
        nonEmptyString(entry.name) ||
        fallbackName,
    });
  };

  if (typeof agentState === 'object' && agentState !== null) {
    const raw = (agentState as { files?: unknown }).files;
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      for (const [path, fileData] of Object.entries(raw)) {
        pushFile({
          path,
          ...(typeof fileData === 'object' &&
          fileData !== null &&
          !Array.isArray(fileData)
            ? fileData
            : {}),
        });
      }
    }
  }
  for (const attachment of attachments) {
    pushFile(attachment ?? {}, '附件');
  }
  return files;
}

/** `agent_state.artifacts`；与产物卡片的提取结果合并去重后是同一形状。 */
export function readAgentStateArtifacts(agentState: unknown): string[] {
  if (typeof agentState !== 'object' || agentState === null) return [];
  const raw = (agentState as { artifacts?: unknown }).artifacts;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (path): path is string => typeof path === 'string' && Boolean(path.trim()),
  );
}

/** 子智能体运行态；`readSubagentRuns` 的直通（同一读取口径）。 */
export function readAgentStateSubagentRuns(agentState: unknown): SubagentRun[] {
  return readSubagentRuns(agentState);
}

/** 状态分区有没有可见内容；空态由调用方渲染「暂无状态内容」。 */
export function hasVisibleStateSections(input: {
  todos: TodoItem[];
  files: AgentStateFile[];
  artifacts: string[];
  subagentRuns: SubagentRun[];
}): boolean {
  return (
    input.todos.length > 0 ||
    input.files.length > 0 ||
    input.artifacts.length > 0 ||
    input.subagentRuns.length > 0
  );
}
