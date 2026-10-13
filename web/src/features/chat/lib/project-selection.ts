/**
 * 项目选择的纯逻辑。
 *
 * 对齐参照的 `utils/projectSelection.js` 与 `ProjectSelectionSection.vue`：默认值是
 * `AUTO_PROJECT_ID`，表示「不使用项目，发送时创建独立目录」，建线程时归一成空串交给后端。
 *
 * 过滤用 `toLowerCase()` 而不是参照的 `toLocaleLowerCase()`：后者不带 locale 时随运行环境变化，
 * 同一个项目名在不同机器上可能命中不同结果。与 `lib/message-time.ts` 固定时区同一个理由。
 */
import type { ProjectItem } from '../api/projects-api';

/** 没有显式选项目时的取值；下发时归一成空串。 */
export const AUTO_PROJECT_ID = '__auto__';

const asText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

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

/**
 * 相对时间文案；与参照同档：刚刚 / N分钟前 / N小时前 / N天前 / N个月前 / N年前。
 *
 * 时间无法解析时返回空串，由调用方决定显示什么。
 */
export function formatRelativeTime(value: unknown, now = Date.now()): string {
  const timestamp = Date.parse(asText(value));
  if (!Number.isFinite(timestamp)) return '';

  const elapsed = Math.max(0, now - timestamp);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (elapsed < minute) return '刚刚';
  if (elapsed < hour) return `${Math.floor(elapsed / minute)}分钟前`;
  if (elapsed < day) return `${Math.floor(elapsed / hour)}小时前`;
  if (elapsed < 30 * day) return `${Math.floor(elapsed / day)}天前`;
  if (elapsed < 365 * day) return `${Math.floor(elapsed / (30 * day))}个月前`;

  return `${Math.floor(elapsed / (365 * day))}年前`;
}

/** 新建项目需要名称与目录两者都非空。 */
export function canCreateProject(input: { name: unknown; path: unknown }): boolean {
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

  return project?.directoryMode === 'linked' ? '个人空间已有目录' : '系统管理目录';
}

/**
 * 把历史对话的工作目录归一成挂载用的绝对路径。
 *
 * 参照去掉了前导与尾随斜杠再加回一个，这里保持一致；归一后为空表示这条候选没有可用目录。
 */
export function normalizeWorkdirPath(path: unknown): string {
  const trimmed = asText(path).replace(/^\/+|\/+$/g, '');

  return trimmed ? `/${trimmed}` : '';
}
