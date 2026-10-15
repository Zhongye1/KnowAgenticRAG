/** 项目选择的纯逻辑。 */
import type { ProjectItem } from '../api/projects-api';

/** 没有显式选项目时的取值；下发时归一成空串。 */
export const AUTO_PROJECT_ID = '__auto__';

const asText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/** 按名称过滤；大小写不敏感，空白查询返回原列表。 */
export function filterProjects(
  projects: ProjectItem[],
  query: unknown,
): ProjectItem[] {
  const keyword = asText(query).toLowerCase();
  if (!keyword) return projects;

  return projects.filter((project) =>
    project.name.toLowerCase().includes(keyword),
  );
}

/** 相对时间文案；实现在 shared（知识库卡片与项目选择共用）。 */
export { formatRelativeTime } from '@/shared/lib';

/** 新建项目需要名称与目录两者都非空。 */
export function canCreateProject(input: {
  name: unknown;
  path: unknown;
}): boolean {
  return Boolean(asText(input.name) && asText(input.path));
}

/** 当前选择是不是「不使用项目」。 */
export function isAutoProject(value: unknown): boolean {
  const text = asText(value);

  return !text || text === AUTO_PROJECT_ID;
}

/** 建线程时下发的项目 id：自动与空都归一成空串。 */
export function resolveProjectId(value: unknown): string {
  return isAutoProject(value) ? '' : asText(value);
}

/** 触发按钮上的项目名。 */
export function projectLabel(value: unknown, projects: ProjectItem[]): string {
  if (isAutoProject(value)) return '选择项目';

  const id = asText(value);

  return projects.find((project) => project.id === id)?.name || '未命名项目';
}

/** 触发按钮上的提示：这个项目的目录从哪来。 */
export function projectHint(value: unknown, projects: ProjectItem[]): string {
  if (isAutoProject(value)) return '不使用项目（发送时创建独立目录）';

  const id = asText(value);
  const project = projects.find((item) => item.id === id);

  return project?.directoryMode === 'linked'
    ? '个人空间已有目录'
    : '系统管理目录';
}

/** 把历史对话的工作目录归一成挂载用的绝对路径。 */
export function normalizeWorkdirPath(path: unknown): string {
  const trimmed = asText(path).replace(/^\/+|\/+$/g, '');

  return trimmed ? `/${trimmed}` : '';
}
