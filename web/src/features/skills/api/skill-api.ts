/**
 * 技能管理接口。
 *
 * 契约在 `backend/server/routers/skill_router.py`：响应是 `{success, data, ...}`，失败是
 * FastAPI 的 `{detail}`（消息含「不存在/无权」→404，其余 ValueError →400）。
 *
 * 两个列表的投影字段不同，不能混用：`/api/skills` 的 `ResolvedSkill.to_dict()` 有
 * `source_scope` 没有 `dir_path`；`/api/system/skills` 的 ORM `Skill.to_dict()` 有
 * `dir_path` 没有 `source_scope`。端点没有 response schema，类型手写，无分页参数。
 */
import {
  confirmPersonalSkillInstallDraftRouteApiSkillsPersonalInstallDraftsDraftIdConfirmPost,
  confirmSkillInstallDraftRouteApiSkillsInstallDraftsDraftIdConfirmPost,
  createSkillFileRouteApiSystemSkillsSlugFilePost,
  deletePersonalSkillRouteApiSkillsPersonalSlugDelete,
  deleteSkillFileRouteApiSystemSkillsSlugFileDelete,
  deleteSkillRouteApiSystemSkillsSlugDelete,
  deleteSkillsBatchRouteApiSystemSkillsDeleteBatchPost,
  discardSkillInstallDraftRouteApiSkillsInstallDraftsDraftIdDelete,
  getDepartmentsApiDepartmentsGet,
  getSkillDependencyOptionsRouteApiSystemSkillsDependencyOptionsGet,
  getSkillFileRouteApiSystemSkillsSlugFileGet,
  getSkillTreeRouteApiSystemSkillsSlugTreeGet,
  listRemoteSkillsRouteApiSkillsRemoteListPost,
  listSkillCardsRouteApiSkillsGet,
  listSkillsRouteApiSystemSkillsGet,
  prepareRemoteSkillsRouteApiSkillsRemotePreparePost,
  prepareSkillUploadRouteApiSkillsImportPreparePost,
  readPersonalSkillFileRouteApiSkillsPersonalSlugFileGet,
  readUserAccessOptionsApiAuthUsersAccessOptionsGet,
  searchRemoteSkillsRouteApiSkillsRemoteSearchPost,
  updateSkillDependenciesRouteApiSystemSkillsSlugDependenciesPut,
  updateSkillEnabledRouteApiSystemSkillsSlugEnabledPut,
  updateSkillFileRouteApiSystemSkillsSlugFilePut,
  updateSkillShareConfigRouteApiSystemSkillsSlugShareConfigPut,
} from '@/shared/api/generated/sdk.gen';
import { apiFetch, unwrap } from '@/shared/api';
import type { ShareConfig } from '@/shared/lib/share-config';

/** 访问级别由后端下发（管理员三种，普通用户只有 `user`）。 */
export type SkillAccessLevel = 'global' | 'department' | 'user';

/** `/api/skills` 的卡片投影（`ResolvedSkill.to_dict()`）。 */
export type SkillCard = {
  id: number | string;
  slug: string;
  name: string;
  description: string;
  source_type: 'builtin' | 'upload' | 'remote' | 'personal' | (string & {});
  /** 个人 / 共享 / 内置的分组依据。 */
  source_scope: 'builtin' | 'shared' | 'personal' | (string & {});
  enabled: boolean;
  created_by: string | null;
  tool_dependencies: string[];
  mcp_dependencies: string[];
  skill_dependencies: string[];
  /** 个人技能覆盖了同名共享技能。 */
  overrides_shared: boolean;
  /** 共享技能被同名个人技能遮蔽。 */
  shadowed_by_personal: boolean;
  /** 后端只在共享配置非 null 时给这个字段（内置与共享技能会给）。 */
  share_config?: ShareConfig | null;
  can_manage: boolean;
  effective_permission: 'none' | 'read' | 'manage';
  is_builtin: boolean;
};

/** `/api/system/skills` 的管理投影（ORM `Skill.to_dict()`）。 */
export type ManagedSkill = {
  id: number;
  slug: string;
  name: string;
  description: string;
  source_type: 'builtin' | 'upload' | 'remote' | (string & {});
  tool_dependencies: string[];
  mcp_dependencies: string[];
  skill_dependencies: string[];
  dir_path: string;
  version: string | null;
  content_hash: string | null;
  share_config: ShareConfig;
  enabled: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  can_manage: boolean;
  effective_permission: 'none' | 'read' | 'manage';
  is_builtin: boolean;
};

/** 列表响应根上还有允许的访问级别。 */
export type SkillCardList = {
  skills: SkillCard[];
  allowedAccessLevels: SkillAccessLevel[];
};

export type ManagedSkillList = {
  skills: ManagedSkill[];
  allowedAccessLevels: SkillAccessLevel[];
};

/** 技能目录树节点（`_build_tree`）。 */
export type SkillFileNode = {
  name: string;
  path: string;
  is_dir: boolean;
  children?: SkillFileNode[];
};

/** 单个文本文件（`read_skill_file` / `read_personal_skill_file`）。 */
export type SkillFileContent = {
  path: string;
  content: string;
};

/** 依赖候选（`get_skill_dependency_options`）：工具带展示名，MCP 与 Skill 只有标识。 */
export type SkillDependencyOptions = {
  tools: Array<{ slug: string; name: string }>;
  mcps: string[];
  skills: string[];
};

/** 安装草稿里的一项；失败项只有 `slug` 与 `error`。 */
export type SkillDraftItem = {
  draft_item_id?: string;
  source_dir?: string;
  slug: string;
  name?: string;
  original_name?: string;
  description?: string;
  tool_dependencies?: string[];
  mcp_dependencies?: string[];
  skill_dependencies?: string[];
  warnings?: string[];
  success?: boolean;
  error?: string;
};

/** 安装草稿（`prepare_skill_upload` / `prepare_remote_skill_install`）。 */
export type SkillDraft = {
  draft_id: string;
  created_by: string;
  source_type: 'upload' | 'remote';
  source: string;
  created_at: number;
  expires_at: number;
  items: SkillDraftItem[];
  default_share_config: ShareConfig;
  allowed_access_levels: SkillAccessLevel[];
};

/** 远程仓库里可安装的 Skill（`_parse_available_skills`）。 */
export type RemoteSkillOption = {
  name: string;
  description?: string;
};

/** 全局搜索命中的 Skill（`_parse_search_skills`）。 */
export type RemoteSkillHit = {
  source: string;
  name: string;
  installs?: string;
};

/** 逐项安装结果（`confirm_*` 的 `data` 数组）。 */
export type SkillInstallResult = {
  slug: string;
  /** 个人安装被占用 slug 时，后端回报请求名与实际名两个字段。 */
  requested_slug?: string;
  success: boolean;
  error?: string;
  skill?: Record<string, unknown>;
};

/** 共享范围的可选对象（部门与用户）。 */
export type SkillShareTargets = {
  departments: Array<{ id: number; name: string }>;
  users: Array<{
    uid: string;
    username: string;
    department_id?: number | null;
    department_name?: string | null;
  }>;
};

type Envelope<T> = {
  success: boolean;
  data?: T;
  allowed_access_levels?: SkillAccessLevel[];
};

/** 列表项里后端可能补上的字段都在这里折一次，缺省值按「没有」处理。 */
const toCard = (raw: Record<string, unknown>): SkillCard =>
  ({
    ...raw,
    tool_dependencies: (raw.tool_dependencies as string[]) ?? [],
    mcp_dependencies: (raw.mcp_dependencies as string[]) ?? [],
    skill_dependencies: (raw.skill_dependencies as string[]) ?? [],
    can_manage: raw.can_manage === true,
    effective_permission:
      (raw.effective_permission as SkillCard['effective_permission']) ?? 'none',
    is_builtin: raw.is_builtin === true,
  }) as SkillCard;

export const skillApi = {
  /** 管理页卡片：个人 + 共享（`GET /api/skills`）。 */
  listSkillCards: async (): Promise<SkillCardList> => {
    const result = unwrap<Envelope<Record<string, unknown>[]>>(
      await listSkillCardsRouteApiSkillsGet(),
    );
    return {
      skills: (result.data ?? []).map(toCard),
      allowedAccessLevels: result.allowed_access_levels ?? ['user'],
    };
  },

  /** 管理投影：详情页要从这里按 slug 找（没有单条 GET）。 */
  listManagedSkills: async (): Promise<ManagedSkillList> => {
    const result = unwrap<Envelope<ManagedSkill[]>>(
      await listSkillsRouteApiSystemSkillsGet(),
    );
    return {
      skills: (result.data ?? []).map((item) => ({
        ...item,
        tool_dependencies: item.tool_dependencies ?? [],
        mcp_dependencies: item.mcp_dependencies ?? [],
        skill_dependencies: item.skill_dependencies ?? [],
        can_manage: item.can_manage === true,
        effective_permission: item.effective_permission ?? 'none',
        is_builtin: item.is_builtin === true,
      })),
      allowedAccessLevels: result.allowed_access_levels ?? ['user'],
    };
  },

  /** 上传 `.zip` 或 `SKILL.md` → 安装草稿。 */
  prepareUpload: async (file: File): Promise<SkillDraft> =>
    unwrap<Envelope<SkillDraft>>(
      await prepareSkillUploadRouteApiSkillsImportPreparePost({
        body: { file },
      }),
    ).data as SkillDraft,

  /** 列出一个远程来源里的可安装 Skill。 */
  listRemote: async (source: string): Promise<RemoteSkillOption[]> =>
    unwrap<Envelope<RemoteSkillOption[]>>(
      await listRemoteSkillsRouteApiSkillsRemoteListPost({ body: { source } }),
    ).data ?? [],

  /** 全局搜索 skills.sh 上的开源 Skill。 */
  searchRemote: async (query: string): Promise<RemoteSkillHit[]> =>
    unwrap<Envelope<RemoteSkillHit[]>>(
      await searchRemoteSkillsRouteApiSkillsRemoteSearchPost({
        body: { query },
      }),
    ).data ?? [],

  /**
   * 拉取并解析远程 Skill → 安装草稿。失败项在草稿的 `items` 里逐项标记。
   *
   * `skillDetails` 只是界面的进度文案，后端只认 `source` 与 `skills`，这里丢掉。
   */
  prepareRemote: async (payload: {
    source: string;
    skills: string[];
    skillDetails?: unknown;
  }): Promise<SkillDraft> =>
    unwrap<Envelope<SkillDraft>>(
      await prepareRemoteSkillsRouteApiSkillsRemotePreparePost({
        body: { source: payload.source, skills: payload.skills },
      }),
    ).data as SkillDraft,

  /** 确认安装到共享 Skill 库（要求 admin）。 */
  confirmSharedDraft: async (
    draftId: string,
    payload: { share_config?: ShareConfig | null; slugs?: string[] },
  ): Promise<SkillInstallResult[]> =>
    unwrap<Envelope<SkillInstallResult[]>>(
      await confirmSkillInstallDraftRouteApiSkillsInstallDraftsDraftIdConfirmPost(
        {
          path: { draft_id: draftId },
          body: payload as never,
        },
      ),
    ).data ?? [],

  /** 确认安装到当前用户个人 Skill 源。 */
  confirmPersonalDraft: async (
    draftId: string,
    slugs: string[],
  ): Promise<SkillInstallResult[]> =>
    unwrap<Envelope<SkillInstallResult[]>>(
      await confirmPersonalSkillInstallDraftRouteApiSkillsPersonalInstallDraftsDraftIdConfirmPost(
        {
          path: { draft_id: draftId },
          body: { slugs },
        },
      ),
    ).data ?? [],

  /** 丢弃安装草稿（取消/关闭与失败清理都必须走它，否则草稿留在磁盘上）。 */
  discardDraft: async (draftId: string): Promise<void> => {
    unwrap<Envelope<never>>(
      await discardSkillInstallDraftRouteApiSkillsInstallDraftsDraftIdDelete({
        path: { draft_id: draftId },
      }),
    );
  },

  /** 技能目录树。 */
  getTree: async (slug: string): Promise<SkillFileNode[]> =>
    unwrap<Envelope<SkillFileNode[]>>(
      await getSkillTreeRouteApiSystemSkillsSlugTreeGet({ path: { slug } }),
    ).data ?? [],

  /** 读共享技能的文本文件。 */
  getFile: async (slug: string, path: string): Promise<SkillFileContent> =>
    unwrap<Envelope<SkillFileContent>>(
      await getSkillFileRouteApiSystemSkillsSlugFileGet({
        path: { slug },
        query: { path },
      }),
    ).data as SkillFileContent,

  /** 读个人技能的文本文件（个人技能不在 `/api/system/skills` 里）。 */
  getPersonalFile: async (
    slug: string,
    path: string,
  ): Promise<SkillFileContent> =>
    unwrap<Envelope<SkillFileContent>>(
      await readPersonalSkillFileRouteApiSkillsPersonalSlugFileGet({
        path: { slug },
        query: { path },
      }),
    ).data as SkillFileContent,

  /** 新建文件或目录。 */
  createNode: async (
    slug: string,
    payload: { path: string; is_dir: boolean; content: string },
  ): Promise<void> => {
    unwrap<Envelope<never>>(
      await createSkillFileRouteApiSystemSkillsSlugFilePost({
        path: { slug },
        body: payload,
      }),
    );
  },

  /** 保存文件内容。 */
  updateFile: async (
    slug: string,
    payload: { path: string; content: string },
  ): Promise<void> => {
    unwrap<Envelope<never>>(
      await updateSkillFileRouteApiSystemSkillsSlugFilePut({
        path: { slug },
        body: payload,
      }),
    );
  },

  /** 删除文件或目录。 */
  deleteNode: async (slug: string, path: string): Promise<void> => {
    unwrap<Envelope<never>>(
      await deleteSkillFileRouteApiSystemSkillsSlugFileDelete({
        path: { slug },
        query: { path },
      }),
    );
  },

  /** 依赖候选；`slug` 只用于把当前技能从 Skill 候选里排除。 */
  getDependencyOptions: async (
    slug?: string,
  ): Promise<SkillDependencyOptions> =>
    unwrap<Envelope<SkillDependencyOptions>>(
      await getSkillDependencyOptionsRouteApiSystemSkillsDependencyOptionsGet({
        query: slug ? { slug } : {},
      }),
    ).data ?? { tools: [], mcps: [], skills: [] },

  /** 覆盖三个依赖清单（后端整份替换）。 */
  updateDependencies: async (
    slug: string,
    payload: {
      tool_dependencies: string[];
      mcp_dependencies: string[];
      skill_dependencies: string[];
    },
  ): Promise<ManagedSkill> =>
    unwrap<Envelope<ManagedSkill>>(
      await updateSkillDependenciesRouteApiSystemSkillsSlugDependenciesPut({
        path: { slug },
        body: payload,
      }),
    ).data as ManagedSkill,

  /** 共享范围（内置技能后端会强制成全局，传了也不生效）。 */
  updateShareConfig: async (
    slug: string,
    shareConfig: ShareConfig,
  ): Promise<ManagedSkill> =>
    unwrap<Envelope<ManagedSkill>>(
      await updateSkillShareConfigRouteApiSystemSkillsSlugShareConfigPut({
        path: { slug },
        body: { share_config: shareConfig },
      }),
    ).data as ManagedSkill,

  /** 启用 / 禁用。 */
  updateEnabled: async (
    slug: string,
    enabled: boolean,
  ): Promise<ManagedSkill> =>
    unwrap<Envelope<ManagedSkill>>(
      await updateSkillEnabledRouteApiSystemSkillsSlugEnabledPut({
        path: { slug },
        body: { enabled },
      }),
    ).data as ManagedSkill,

  /**
   * 导出 zip。
   *
   * 返回文件流，生成物只给解析后的响应体，因此走手写层拿 blob；文件名与后端
   * `export_skill_zip` 的 `download_name` 同口径（`{slug}.zip`，纯 ASCII）。
   */
  exportZip: async (slug: string): Promise<Blob> => {
    const response = await apiFetch(
      `/api/system/skills/${encodeURIComponent(slug)}/export`,
    );
    return response.blob();
  },

  /** 删除共享技能（后端拒绝内置技能）。 */
  deleteSkill: async (slug: string): Promise<void> => {
    unwrap<Envelope<never>>(
      await deleteSkillRouteApiSystemSkillsSlugDelete({ path: { slug } }),
    );
  },

  /** 删除当前用户的个人技能。 */
  deletePersonalSkill: async (slug: string): Promise<void> => {
    unwrap<Envelope<never>>(
      await deletePersonalSkillRouteApiSkillsPersonalSlugDelete({
        path: { slug },
      }),
    );
  },

  /** 批量删除；逐项结果由后端给（单条失败不影响其余）。 */
  deleteBatch: async (slugs: string[]): Promise<SkillInstallResult[]> =>
    unwrap<Envelope<SkillInstallResult[]>>(
      await deleteSkillsBatchRouteApiSystemSkillsDeleteBatchPost({
        body: { slugs },
      }),
    ).data ?? [],

  /** 共享范围的可选对象；与知识库读同一对端点，但同层切片不能互引，各自读一次。 */
  listShareTargets: async (): Promise<SkillShareTargets> => {
    const [departments, users] = await Promise.all([
      unwrap<SkillShareTargets['departments']>(
        await getDepartmentsApiDepartmentsGet(),
      ),
      unwrap<SkillShareTargets['users']>(
        await readUserAccessOptionsApiAuthUsersAccessOptionsGet(),
      ),
    ]);
    return { departments, users };
  },
};
