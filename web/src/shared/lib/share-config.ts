/**
 * 共享范围（`share_config` v2）的归一与校验。
 *
 * 读/管两个范围各自是 `{access_level, department_ids, user_uids}`：`global` 清空两个
 * 数组、`department` 清空用户、`user` 清空部门；管理范围必须落在读取范围之内（读取是
 * 全局时天然满足）。规则与后端 `_normalize_scope` / `_validate_manage_scope` 同口径，
 * 界面先用同一份判定拦一次，后端仍是授权边界。
 */
export const ACCESS_LEVELS = ['global', 'department', 'user'] as const;

export type AccessLevel = (typeof ACCESS_LEVELS)[number];

/** 一个共享范围；部门 id 是数字（后端 `_normalize_share_config` 用 `int()`），用户是 uid 字符串。 */
export type ShareScope = {
  access_level: AccessLevel;
  department_ids?: number[];
  user_uids?: string[];
};

export type ShareConfig = {
  version: number;
  read_scope: ShareScope;
  manage_scope?: ShareScope | null;
};

/** 只有这三种级别；其余按允许列表的第一项处理。 */
export const normalizeAccessLevel = (
  level: unknown,
  allowed: readonly AccessLevel[] = ACCESS_LEVELS,
): AccessLevel => {
  const list = allowed.length > 0 ? allowed : (['global'] as AccessLevel[]);
  const value = String(level ?? '') as AccessLevel;
  return list.includes(value) ? value : list[0];
};

/** 归一一个范围：按级别清空无关数组、去重、按类型转换 id。 */
export const normalizeShareScope = (
  scope?: Partial<ShareScope> | null,
  allowed: readonly AccessLevel[] = ACCESS_LEVELS,
): ShareScope | null => {
  if (!scope) return null;
  const accessLevel = normalizeAccessLevel(scope.access_level, allowed);
  const departmentIds =
    accessLevel === 'department'
      ? Array.from(
          new Set(
            (scope.department_ids ?? [])
              .map((id) => Number(id))
              .filter((id) => Number.isFinite(id)),
          ),
        )
      : [];
  const userUids =
    accessLevel === 'user'
      ? Array.from(
          new Set(
            (scope.user_uids ?? [])
              .map((uid) => String(uid).trim())
              .filter(Boolean),
          ),
        )
      : [];
  return {
    access_level: accessLevel,
    department_ids: departmentIds,
    user_uids: userUids,
  };
};

/** 归一整个共享配置；读取范围缺失时按全局共享处理。 */
export const normalizeShareConfig = (
  config?: Partial<ShareConfig> | null,
  allowed: readonly AccessLevel[] = ACCESS_LEVELS,
): ShareConfig => ({
  version: 2,
  read_scope:
    normalizeShareScope(config?.read_scope, allowed) ??
    normalizeShareScope({ access_level: 'global' }, allowed)!,
  manage_scope: normalizeShareScope(config?.manage_scope, allowed),
});

/** 管理范围是否落在读取范围内（读取为全局时恒成立）。 */
export const isManageScopeWithinRead = (
  manageScope?: ShareScope | null,
  readScope?: ShareScope | null,
): boolean => {
  if (!manageScope || !readScope) return true;
  if (readScope.access_level === 'global') return true;
  if (manageScope.access_level !== readScope.access_level) return false;
  if (readScope.access_level === 'user') {
    return (manageScope.user_uids ?? []).every((uid) =>
      (readScope.user_uids ?? []).includes(uid),
    );
  }
  if (manageScope.access_level === 'department') {
    return (manageScope.department_ids ?? []).every((id) =>
      (readScope.department_ids ?? []).includes(id),
    );
  }
  return true;
};

/**
 * 范围按部门/指定人限定却没有选对象时的说明；`subject` 为空串表示读取范围。
 * 后端在这两种形状上都返回 400，前端先拦一次并给出同一口径的说明。
 */
const emptyScopeMessage = (
  scope: ShareScope,
  subject: string,
): string | null => {
  if (
    scope.access_level === 'department' &&
    (scope.department_ids ?? []).length === 0
  ) {
    return `${subject}按部门共享时至少要选一个部门。`;
  }
  if (scope.access_level === 'user' && (scope.user_uids ?? []).length === 0) {
    return `${subject}指定人共享时至少要选一个用户。`;
  }
  return null;
};

/** 保存前的校验：管理范围越界与空范围都给出可行动的说明。 */
export const validateShareConfig = (config: ShareConfig): string | null => {
  if (!isManageScopeWithinRead(config.manage_scope, config.read_scope)) {
    return '管理范围必须落在读取范围内：请把管理范围改成与读取范围相同的级别，并只勾选读取范围里的对象。';
  }
  return (
    emptyScopeMessage(config.read_scope, '') ??
    (config.manage_scope
      ? emptyScopeMessage(config.manage_scope, '管理范围')
      : null)
  );
};

/**
 * 单个范围的一句话摘要；管理范围传 `verb='管理'`，读取范围用默认的「访问」。
 * 范围为空（只可能是未设置的管理范围）时不冒充「所有用户」。
 */
export const describeScope = (
  scope?: Partial<ShareScope> | null,
  verb = '访问',
): string => {
  const normalized = normalizeShareScope(scope);
  if (!normalized) return '未单独设置';
  if (normalized.access_level === 'global') {
    return `所有用户都可以${verb}`;
  }
  if (normalized.access_level === 'department') {
    return `${normalized.department_ids?.length ?? 0} 个部门可${verb}`;
  }
  return `${normalized.user_uids?.length ?? 0} 个用户可${verb}`;
};

/** 卡片/徽标上的一句话摘要。 */
export const describeShareConfig = (
  config?: Partial<ShareConfig> | null,
): { label: string; detail: string } => {
  const scope = normalizeShareConfig(config).read_scope;
  const label =
    scope.access_level === 'global'
      ? '全局共享'
      : scope.access_level === 'department'
        ? '部门共享'
        : '指定人';
  return { label, detail: describeScope(scope) };
};
