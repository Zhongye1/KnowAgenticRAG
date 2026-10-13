/**
 * 项目端点。
 *
 * 与其它 api 段一样只走契约生成物；三个端点都没有声明响应模型，字段按不可信数据处理。
 *
 * 创建请求的请求体是 `{request_id, name, workdir: {mode, path}}`，`linked` 模式的路径要去掉
 * 前导斜杠；历史候选的搜索参数名是 `q`。
 */
import { unwrap } from '@/shared/api';
import {
  createProjectApiProjectsPost,
  listHistoryCandidatesApiProjectsHistoryCandidatesGet,
  listProjectsApiProjectsGet,
} from '@/shared/api/generated/sdk.gen';

/** 可选项目；只留界面用得到的字段。 */
export type ProjectItem = {
  id: string;
  name: string;
  workdirPath: string;
  /** `linked` 表示个人空间里已有的目录，其余按系统管理目录展示。 */
  directoryMode: string;
};

/** 可作为新项目目录的历史对话。 */
export type HistoryCandidate = {
  threadId: string;
  title: string;
  agentId: string;
  workdirPath: string;
  updatedAt: string;
};

const asText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** 缺 `id` 的项目丢掉；名称缺失时退到 id。 */
export function normalizeProjects(raw: unknown): ProjectItem[] {
  if (!Array.isArray(raw)) return [];

  const projects: ProjectItem[] = [];

  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;

    const project = entry as Record<string, unknown>;
    const id = asText(project.id);
    if (!id) continue;

    projects.push({
      id,
      name: asText(project.name) || id,
      workdirPath: asText(project.workdir_path),
      directoryMode: asText(project.directory_mode),
    });
  }

  return projects;
}

/** 缺 `thread_id` 或 `workdir_path` 的候选丢掉——它们没有可用的目录。 */
export function normalizeHistoryCandidates(raw: unknown): {
  items: HistoryCandidate[];
  hasMore: boolean;
} {
  const source =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const items: HistoryCandidate[] = [];

  for (const entry of Array.isArray(source.items) ? source.items : []) {
    if (typeof entry !== 'object' || entry === null) continue;

    const candidate = entry as Record<string, unknown>;
    const threadId = asText(candidate.thread_id);
    const workdirPath = asText(candidate.workdir_path);
    if (!threadId || !workdirPath) continue;

    items.push({
      threadId,
      title: asText(candidate.title),
      agentId: asText(candidate.agent_id),
      workdirPath,
      updatedAt: asText(candidate.updated_at),
    });
  }

  return { items, hasMore: source.has_more === true };
}

/** 当前用户可选择的项目。 */
export async function listProjects(): Promise<ProjectItem[]> {
  return normalizeProjects(unwrap<unknown>(await listProjectsApiProjectsGet()));
}

/**
 * 建一个 `linked` 项目：把个人空间里已有的目录挂成项目。
 *
 * `request_id` 由调用方给，重试同一次创建时复用它，避免产生两个同名项目。
 */
export async function createLinkedProject(input: {
  requestId: string;
  name: string;
  /** 绝对路径形式（`/a/b`）；下发时去掉前导斜杠。 */
  path: string;
}): Promise<ProjectItem> {
  const response = unwrap<unknown>(
    await createProjectApiProjectsPost({
      body: {
        request_id: input.requestId,
        name: input.name,
        workdir: { mode: 'linked', path: input.path.replace(/^\/+/, '') },
      },
    }),
  );

  const project = normalizeProjects([response])[0];
  // 与参照同义：创建结果必须带回 id，否则界面拿不到可下发的项目
  if (!project) throw new Error('项目创建结果缺少 id');

  return project;
}

/** 可作为新项目目录的历史对话。 */
export async function listHistoryCandidates(input: {
  query?: string;
  limit?: number;
} = {}): Promise<{ items: HistoryCandidate[]; hasMore: boolean }> {
  return normalizeHistoryCandidates(
    unwrap<unknown>(
      await listHistoryCandidatesApiProjectsHistoryCandidatesGet({
        query: { q: input.query ?? '', limit: input.limit ?? 20 },
      }),
    ),
  );
}
