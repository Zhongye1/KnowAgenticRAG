/**
 * 安装流的状态与纯规则。
 *
 * 单弹窗五阶段 `selecting → preparing → reviewing → installing → result`，目标
 * `personal / shared`；入口两种：`draft`（上传后直接确认）与 `remote`（按仓库拉取
 * 或全局搜索）。
 *
 * 取消与关闭必须丢弃本次生成的草稿（`DELETE /api/skills/install-drafts/{id}`），
 * 否则草稿会在磁盘上留到过期；已经装成功的条目不会因为其他条目失败而回滚。
 */
import type {
  SkillAccessLevel,
  SkillDraft,
  SkillDraftItem,
  SkillInstallResult,
} from '../api/skill-api';

export type InstallPhase =
  'selecting' | 'preparing' | 'reviewing' | 'installing' | 'result';

export type InstallTarget = 'personal' | 'shared';

/** 逐项进度；`active` 表示这一项正在被拉取/解析。 */
export type InstallStatus = 'waiting' | 'active' | 'success' | 'failed';

export const STEP_LABELS = ['选择', '加载', '位置', '完成'] as const;

/** 一个远程来源的一次解析请求。 */
export type RemoteRequest = {
  source: string;
  skills: string[];
  skillDetails?: Array<{ slug: string; name?: string; description?: string }>;
};

/** 解析阶段的逐项进度。 */
export type ProgressItem = {
  key: string;
  slug: string;
  name: string;
  description: string;
  source: string;
  status: InstallStatus;
};

/** 待确认/待安装的一项；草稿里的失败项也在列表里（标红并可移除）。 */
export type ReviewItem = {
  key: string;
  draft_id: string;
  source: string;
  source_type: string;
  slug: string;
  name: string;
  description: string;
  warnings: string[];
  success: boolean;
  error?: string;
};

export type InstallItem = ReviewItem & {
  status: InstallStatus;
  error?: string;
};

/** 弹窗头部显示的步骤序号（result 与 installing 同属第 4 步）。 */
export const phaseStepIndex = (phase: InstallPhase): number =>
  ({ selecting: 0, preparing: 1, reviewing: 2, installing: 3, result: 3 })[
    phase
  ];

/** 加载中与安装中不允许关闭（加载失败后允许，否则用户被卡在弹窗里）。 */
export const canCloseFlow = (phase: InstallPhase, hasError: boolean): boolean =>
  phase !== 'installing' && (phase !== 'preparing' || hasError);

/** 解析阶段的进度项：按请求顺序展开，状态先都是等待。 */
export const initializeProgressItems = (
  requests: RemoteRequest[],
): ProgressItem[] =>
  requests.flatMap((request) =>
    request.skills.map((slug) => {
      const detail = request.skillDetails?.find((item) => item.slug === slug);
      return {
        key: `${request.source}:${slug}`,
        slug,
        name: detail?.name || slug,
        description: detail?.description ?? '',
        source: request.source,
        status: 'waiting' as InstallStatus,
      };
    }),
  );

/** 把某个来源的进度项置为指定状态（该来源的请求正在飞行时用 active）。 */
export const setProgressStatus = (
  items: ProgressItem[],
  source: string,
  status: InstallStatus,
): ProgressItem[] =>
  items.map((item) => (item.source === source ? { ...item, status } : item));

/** 草稿条目摊平成待确认项；`draft_id` / `source` 决定确认时发给哪个草稿。 */
export const flattenDraftItems = (drafts: SkillDraft[]): ReviewItem[] =>
  drafts.flatMap((draft) =>
    (draft.items ?? []).map((item) => toReviewItem(item, draft)),
  );

const toReviewItem = (item: SkillDraftItem, draft: SkillDraft): ReviewItem => ({
  key: `${draft.draft_id}:${item.slug}`,
  draft_id: draft.draft_id,
  source: draft.source,
  source_type: draft.source_type,
  slug: item.slug,
  name: item.name || item.slug,
  description: item.description ?? '',
  warnings: item.warnings ?? [],
  success: item.success !== false,
  error: item.error,
});

/** 可安装的项（草稿里解析失败的不算）。 */
export const readyReviewItems = (items: ReviewItem[]): ReviewItem[] =>
  items.filter((item) => item.success);

/** 逐项进度列表的初始状态：全部等待。 */
export const toInstallItems = (items: ReviewItem[]): InstallItem[] =>
  items.map((item) => ({ ...item, status: 'waiting' as InstallStatus }));

/**
 * 并回逐项安装结果。
 *
 * 个人安装会遇到 slug 被占用：后端回报 `requested_slug`（草稿里的名字）与 `slug`
 * （实际安装的名字），因此匹配以 `requested_slug ?? slug` 为准，否则失败项会被
 * 留在「等待」上，看起来像没跑完。
 */
export const applyInstallResults = (
  items: InstallItem[],
  results: SkillInstallResult[],
  source: string,
): InstallItem[] => {
  const byKey = new Map(
    results.map((result) => [
      `${source}:${result.requested_slug || result.slug}`,
      result,
    ]),
  );
  return items.map((item) => {
    const result = byKey.get(`${item.source}:${item.slug}`);
    if (!result) return item;
    return {
      ...item,
      status: result.success ? 'success' : 'failed',
      error: result.error || '',
    };
  });
};

/** 请求整体失败（网络/后端异常）时，仍在等待的项按失败收尾并带上原因。 */
export const failWaitingItems = (
  items: InstallItem[],
  message: string,
): InstallItem[] =>
  items.map((item) =>
    item.status === 'waiting'
      ? { ...item, status: 'failed' as InstallStatus, error: message }
      : item,
  );

/**
 * 失败项只有在能重放时才可重试：只有远程来源带得回原请求参数；
 * 上传草稿的源文件已经不在（草稿在失败后清掉了），必须回到上传入口重来。
 */
export const isRetryableFailure = (item: InstallItem): boolean =>
  item.status === 'failed' && item.source_type === 'remote' && !!item.source;

/** 可重试的失败项按来源分组，得到新的解析请求。 */
export const retryRequests = (items: InstallItem[]): RemoteRequest[] => {
  const grouped = new Map<string, string[]>();
  items.filter(isRetryableFailure).forEach((item) => {
    const list = grouped.get(item.source) ?? [];
    list.push(item.slug);
    grouped.set(item.source, list);
  });
  return [...grouped].map(([source, skills]) => ({ source, skills }));
};

export type InstallSummary = { success: number; failed: number };

export const summarizeInstall = (items: InstallItem[]): InstallSummary => ({
  success: items.filter((item) => item.status === 'success').length,
  failed: items.filter((item) => item.status === 'failed').length,
});

/** 结果区标题。 */
export const resultTitle = (items: InstallItem[]): string => {
  const { success, failed } = summarizeInstall(items);
  if (failed === 0) return '全部 Skill 安装完成';
  if (success > 0) return '部分 Skill 安装完成';
  return 'Skill 安装失败';
};

/** 安装位置的展示名：个人，或按共享范围显示全局 / 部门 / 指定人。 */
export const installTargetLabel = (
  target: InstallTarget,
  readLevel?: SkillAccessLevel,
): string => {
  if (target === 'personal') return '个人 Skill';
  if (readLevel === 'global') return '全局共享';
  if (readLevel === 'department') return '部门共享';
  return '指定人';
};

/** 个人技能不加载依赖，与共享技能同名时完整覆盖共享版本。 */
export const PERSONAL_INSTALL_NOTE =
  '个人 Skill 不加载工具、MCP 或其他 Skill 依赖；与共享 Skill 同名时完整覆盖共享版本。';
