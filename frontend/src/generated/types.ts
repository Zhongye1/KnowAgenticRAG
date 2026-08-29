/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

export type ApiResponse<T = unknown> = {
  code: number;
  msg: string;
  data: T;
};

export type PageData<T> = {
  items: T[];
  total: number;
  page: number;
  size: number;
  total_pages: number;
  links?: Links;
};

export type ResponseModel = ApiResponse<unknown>;

export interface AddUserParam {
  username: string;
  password: string;
  nickname?: string | null;
  email?: string | null;
  phone?: string | null;
  dept_id: number;
  roles: number[];
}

export interface AuthLoginParam {
  username: string;
  password: string;
  uuid?: string | null;
  captcha?: string | null;
}

export interface CpuInfo {
  physical_num: number;
  logical_num: number;
  max_freq: number;
  min_freq: number;
  current_freq: number;
  usage: number;
}

export interface CreateConfigParam {
  name: string;
  type?: string | null;
  key: string;
  value: string;
  is_frontend: boolean;
  remark?: string | null;
}

export interface CreateDataRuleParam {
  name: string;
  model: string;
  column: string;
  operator: RoleDataRuleOperatorType;
  expression: RoleDataRuleExpressionType;
  value: string;
}

export interface CreateDataScopeParam {
  name: string;
  status: StatusType;
}

export interface CreateDeptParam {
  name: string;
  parent_id?: number | null;
  sort?: number;
  leader?: string | null;
  phone?: string | null;
  email?: string | null;
  status: StatusType;
}

export interface CreateDictDataParam {
  type_id: number;
  label: string;
  value: string;
  color?: string | null;
  sort: number;
  status: StatusType;
  remark?: string | null;
}

export interface CreateDictTypeParam {
  name: string;
  code: string;
  remark?: string | null;
}

export interface CreateGenBusinessParam {
  app_name: string;
  table_name: string;
  doc_comment: string;
  table_comment?: string | null;
  class_name?: string | null;
  schema_name?: string | null;
  filename?: string | null;
  datetime_mixin?: boolean;
  api_version?: string;
  tag?: string | null;
  gen_path?: string | null;
  remark?: string | null;
}

export interface CreateGenColumnParam {
  name: string;
  comment?: string | null;
  type: string;
  default?: string | null;
  sort: number;
  length: number;
  is_pk?: boolean;
  is_nullable?: boolean;
  gen_business_id: number;
}

export interface CreateMenuParam {
  title: string;
  name: string;
  path?: string | null;
  parent_id?: number | null;
  sort?: number;
  icon?: string | null;
  type: MenuType;
  component?: string | null;
  perms?: string | null;
  status: StatusType;
  display: StatusType;
  cache: StatusType;
  link?: string | null;
  remark?: string | null;
}

export interface CreateNoticeParam {
  title: string;
  type: NoticeType;
  status: StatusType;
  content: string;
}

export interface CreateRoleParam {
  name: string;
  status: StatusType;
  is_filter_scopes?: boolean;
  remark?: string | null;
}

export interface CreateTaskSchedulerParam {
  name: string;
  task: string;
  args?: unknown | null;
  kwargs?: unknown | null;
  queue?: string | null;
  exchange?: string | null;
  routing_key?: string | null;
  start_time?: string | null;
  expire_time?: string | null;
  expire_seconds?: number | null;
  type: TaskSchedulerType;
  interval_every?: number | null;
  interval_period?: PeriodType | null;
  crontab?: string;
  one_off?: boolean;
  remark?: string | null;
}

export interface DeleteDataRuleParam {
  pks: number[];
}

export interface DeleteDataScopeParam {
  pks: number[];
}

export interface DeleteDictDataParam {
  pks: number[];
}

export interface DeleteDictTypeParam {
  pks: number[];
}

export interface DeleteLoginLogParam {
  pks: number[];
}

export interface DeleteNoticeParam {
  pks: number[];
}

export interface DeleteOperaLogParam {
  pks: number[];
}

export interface DeleteRoleParam {
  pks: number[];
}

export interface DeleteTaskResultParam {
  pks: number[];
}

export interface DiskInfo {
  dir: string;
  device: string;
  type: string;
  total: string;
  used: string;
  free: string;
  usage: string;
}

export interface GetCaptchaDetail {
  is_enabled: boolean;
  expire_seconds: number;
  uuid: string;
  image: string;
}

export interface GetConfigDetail {
  name: string;
  type?: string | null;
  key: string;
  value: string;
  is_frontend: boolean;
  remark?: string | null;
  id: number;
  created_time: string;
  updated_time?: string | null;
}

export interface GetCurrentUserInfoWithRelationDetail {
  dept_id?: number | null;
  username: string;
  nickname: string;
  avatar?: string | null;
  email?: string | null;
  phone?: string | null;
  id: number;
  uuid: string;
  status: StatusType;
  is_superuser: boolean;
  is_staff: boolean;
  is_multi_login: boolean;
  join_time: string;
  last_login_time?: string | null;
  dept?: string | null;
  roles: string[];
}

export interface GetDataRuleColumnDetail {
  key: string;
  comment: string | null;
}

export interface GetDataRuleDetail {
  name: string;
  model: string;
  column: string;
  operator: RoleDataRuleOperatorType;
  expression: RoleDataRuleExpressionType;
  value: string;
  id: number;
  created_time: string;
  updated_time?: string | null;
}

export interface GetDataRuleTemplateVariableDetail {
  key: string;
  comment: string;
}

export interface GetDataScopeDetail {
  name: string;
  status: StatusType;
  id: number;
  created_time: string;
  updated_time?: string | null;
}

export interface GetDataScopeWithRelationDetail {
  name: string;
  status: StatusType;
  id: number;
  created_time: string;
  updated_time?: string | null;
  rules?: (GetDataRuleDetail | null)[];
}

export interface GetDeptDetail {
  name: string;
  parent_id?: number | null;
  sort?: number;
  leader?: string | null;
  phone?: string | null;
  email?: string | null;
  status: StatusType;
  id: number;
  deleted: number;
  created_time: string;
  updated_time?: string | null;
  deleted_time?: string | null;
}

export interface GetDeptTree {
  name: string;
  parent_id?: number | null;
  sort?: number;
  leader?: string | null;
  phone?: string | null;
  email?: string | null;
  status: StatusType;
  id: number;
  deleted: number;
  created_time: string;
  updated_time?: string | null;
  deleted_time?: string | null;
  children?: GetDeptTree[] | null;
}

export interface GetDictDataDetail {
  type_id: number;
  label: string;
  value: string;
  color?: string | null;
  sort: number;
  status: StatusType;
  remark?: string | null;
  id: number;
  type_code: string;
  created_time: string;
  updated_time?: string | null;
}

export interface GetDictTypeDetail {
  name: string;
  code: string;
  remark?: string | null;
  id: number;
  created_time: string;
  updated_time?: string | null;
}

export interface GetGenBusinessDetail {
  app_name: string;
  table_name: string;
  doc_comment: string;
  table_comment?: string | null;
  class_name?: string | null;
  schema_name?: string | null;
  filename?: string | null;
  datetime_mixin?: boolean;
  api_version?: string;
  tag?: string | null;
  gen_path?: string | null;
  remark?: string | null;
  id: number;
  created_time: string;
  updated_time?: string | null;
}

export interface GetGenColumnDetail {
  name: string;
  comment?: string | null;
  type: string;
  default?: string | null;
  sort: number;
  length: number;
  is_pk?: boolean;
  is_nullable?: boolean;
  gen_business_id: number;
  id: number;
  pd_type: string;
}

export interface GetLoginLogDetail {
  user_uuid: string;
  username: string;
  status: number;
  ip: string;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  user_agent: string | null;
  browser?: string | null;
  os?: string | null;
  device?: string | null;
  msg: string;
  login_time: string;
  id: number;
  created_time: string;
}

export interface GetLoginToken {
  access_token: string;
  access_token_expire_time: string;
  session_uuid: string;
  password_expire_days_remaining?: number | null;
  user: GetUserInfoDetail;
}

export interface GetMenuDetail {
  title: string;
  name: string;
  path?: string | null;
  parent_id?: number | null;
  sort?: number;
  icon?: string | null;
  type: MenuType;
  component?: string | null;
  perms?: string | null;
  status: StatusType;
  display: StatusType;
  cache: StatusType;
  link?: string | null;
  remark?: string | null;
  id: number;
  created_time: string;
  updated_time?: string | null;
}

export interface GetMenuTree {
  title: string;
  name: string;
  path?: string | null;
  parent_id?: number | null;
  sort?: number;
  icon?: string | null;
  type: MenuType;
  component?: string | null;
  perms?: string | null;
  status: StatusType;
  display: StatusType;
  cache: StatusType;
  link?: string | null;
  remark?: string | null;
  id: number;
  created_time: string;
  updated_time?: string | null;
  children?: GetMenuTree[] | null;
}

export interface GetNewToken {
  access_token: string;
  access_token_expire_time: string;
  session_uuid: string;
}

export interface GetNoticeDetail {
  title: string;
  type: NoticeType;
  status: StatusType;
  content: string;
  id: number;
  created_time: string;
  updated_time?: string | null;
}

export interface GetOperaLogDetail {
  trace_id: string;
  username?: string | null;
  method: string;
  title: string;
  path: string;
  ip: string;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  user_agent: string | null;
  os?: string | null;
  browser?: string | null;
  device?: string | null;
  args?: Record<string, unknown> | null;
  status: StatusType;
  code: string;
  msg?: string | null;
  cost_time: number;
  opera_time: string;
  id: number;
  created_time: string;
}

export interface GetRoleDetail {
  name: string;
  status: StatusType;
  is_filter_scopes?: boolean;
  remark?: string | null;
  id: number;
  created_time: string;
  updated_time?: string | null;
}

export interface GetRoleWithRelationDetail {
  name: string;
  status: StatusType;
  is_filter_scopes?: boolean;
  remark?: string | null;
  id: number;
  created_time: string;
  updated_time?: string | null;
  menus?: (GetMenuDetail | null)[];
  scopes?: (GetDataScopeWithRelationDetail | null)[];
}

export interface GetSwaggerToken {
  access_token: string;
  token_type?: string;
  user: GetUserInfoDetail;
}

export interface GetTaskResultDetail {
  task_id: string;
  status: string;
  result: unknown | null;
  date_done: string | null;
  traceback: string | null;
  name: string | null;
  args: null | unknown;
  kwargs: null | unknown;
  worker: string | null;
  retries: number | null;
  queue: string | null;
  id: number;
}

export interface GetTaskSchedulerDetail {
  name: string;
  task: string;
  args?: unknown | null;
  kwargs?: unknown | null;
  queue?: string | null;
  exchange?: string | null;
  routing_key?: string | null;
  start_time?: string | null;
  expire_time?: string | null;
  expire_seconds?: number | null;
  type: TaskSchedulerType;
  interval_every?: number | null;
  interval_period?: PeriodType | null;
  crontab?: string;
  one_off?: boolean;
  remark?: string | null;
  id: number;
  enabled: boolean;
  total_run_count: number;
  last_run_time?: string | null;
  created_time: string;
  updated_time?: string | null;
}

export interface GetTokenDetail {
  id: number;
  session_uuid: string;
  username: string;
  nickname: string;
  ip: string;
  os: string;
  browser: string;
  device: string;
  status: StatusType;
  last_login_time: string;
  expire_time: string;
}

export interface GetUserInfoDetail {
  dept_id?: number | null;
  username: string;
  nickname: string;
  avatar?: string | null;
  email?: string | null;
  phone?: string | null;
  id: number;
  uuid: string;
  status: StatusType;
  is_superuser: boolean;
  is_staff: boolean;
  is_multi_login: boolean;
  join_time: string;
  last_login_time?: string | null;
}

export interface GetUserInfoWithRelationDetail {
  dept_id?: number | null;
  username: string;
  nickname: string;
  avatar?: string | null;
  email?: string | null;
  phone?: string | null;
  id: number;
  uuid: string;
  status: StatusType;
  is_superuser: boolean;
  is_staff: boolean;
  is_multi_login: boolean;
  join_time: string;
  last_login_time?: string | null;
  dept?: GetDeptDetail | null;
  roles: GetRoleWithRelationDetail[];
}

export interface HTTPValidationError {
  detail?: ValidationError[];
}

export interface ImportParam {
  app: string;
  table_schema: string;
  table_name: string;
}

export type JsonValue = unknown;

export interface MemInfo {
  total: number;
  used: number;
  free: number;
  usage: number;
}

export type MenuType = 0 | 1 | 2 | 3 | 4;

export type NoticeType = 0 | 1;

export type PeriodType = 'days' | 'hours' | 'minutes' | 'seconds' | 'microseconds';

export type PluginType = 'zip' | 'git';

export interface RedisCommandStat {
  name: string;
  value: string;
}

export interface RedisMonitorInfo {
  info: RedisServerInfo;
  stats: RedisCommandStat[];
}

export interface RedisServerInfo {
  redis_version: string;
  redis_mode: string;
  role: string;
  tcp_port: string;
  uptime: string;
  connected_clients: string;
  blocked_clients: string;
  used_memory_human: string;
  used_memory_rss_human: string;
  maxmemory_human: string;
  mem_fragmentation_ratio: string;
  instantaneous_ops_per_sec: string;
  total_commands_processed: string;
  rejected_connections: string;
  keys_num: string;
}

export interface ResetPasswordParam {
  old_password: string;
  new_password: string;
  confirm_password: string;
}

export type RoleDataRuleExpressionType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type RoleDataRuleOperatorType = 0 | 1;

export interface ServerMonitorInfo {
  cpu: CpuInfo;
  mem: MemInfo;
  sys: SysInfo;
  disk: DiskInfo[];
  service: ServiceInfo;
}

export interface ServiceInfo {
  name: string;
  version: string;
  home: string;
  startup: string;
  elapsed: string;
  cpu_usage: string;
  mem_vms: string;
  mem_rss: string;
  mem_free: string;
}

export type StatusType = 0 | 1;

export interface SysInfo {
  name: string;
  os: string;
  ip: string;
  arch: string;
}

export interface TaskRegisteredDetail {
  name: string;
  task: string;
}

export type TaskSchedulerType = 0 | 1;

export interface UpdateConfigParam {
  name: string;
  type?: string | null;
  key: string;
  value: string;
  is_frontend: boolean;
  remark?: string | null;
}

export interface UpdateConfigsParam {
  name: string;
  type?: string | null;
  key: string;
  value: string;
  is_frontend: boolean;
  remark?: string | null;
  id: number;
}

export interface UpdateDataRuleParam {
  name: string;
  model: string;
  column: string;
  operator: RoleDataRuleOperatorType;
  expression: RoleDataRuleExpressionType;
  value: string;
}

export interface UpdateDataScopeParam {
  name: string;
  status: StatusType;
}

export interface UpdateDataScopeRuleParam {
  rules: number[];
}

export interface UpdateDeptParam {
  name: string;
  parent_id?: number | null;
  sort?: number;
  leader?: string | null;
  phone?: string | null;
  email?: string | null;
  status: StatusType;
}

export interface UpdateDictDataParam {
  type_id: number;
  label: string;
  value: string;
  color?: string | null;
  sort: number;
  status: StatusType;
  remark?: string | null;
}

export interface UpdateDictTypeParam {
  name: string;
  code: string;
  remark?: string | null;
}

export interface UpdateGenBusinessParam {
  app_name: string;
  table_name: string;
  doc_comment: string;
  table_comment?: string | null;
  class_name?: string | null;
  schema_name?: string | null;
  filename?: string | null;
  datetime_mixin?: boolean;
  api_version?: string;
  tag?: string | null;
  gen_path?: string | null;
  remark?: string | null;
}

export interface UpdateGenColumnParam {
  name: string;
  comment?: string | null;
  type: string;
  default?: string | null;
  sort: number;
  length: number;
  is_pk?: boolean;
  is_nullable?: boolean;
  gen_business_id: number;
}

export interface UpdateMenuParam {
  title: string;
  name: string;
  path?: string | null;
  parent_id?: number | null;
  sort?: number;
  icon?: string | null;
  type: MenuType;
  component?: string | null;
  perms?: string | null;
  status: StatusType;
  display: StatusType;
  cache: StatusType;
  link?: string | null;
  remark?: string | null;
}

export interface UpdateNoticeParam {
  title: string;
  type: NoticeType;
  status: StatusType;
  content: string;
}

export interface UpdateRoleMenuParam {
  menus: number[];
}

export interface UpdateRoleParam {
  name: string;
  status: StatusType;
  is_filter_scopes?: boolean;
  remark?: string | null;
}

export interface UpdateRoleScopeParam {
  scopes: number[];
}

export interface UpdateTaskSchedulerParam {
  name: string;
  task: string;
  args?: unknown | null;
  kwargs?: unknown | null;
  queue?: string | null;
  exchange?: string | null;
  routing_key?: string | null;
  start_time?: string | null;
  expire_time?: string | null;
  expire_seconds?: number | null;
  type: TaskSchedulerType;
  interval_every?: number | null;
  interval_period?: PeriodType | null;
  crontab?: string;
  one_off?: boolean;
  remark?: string | null;
}

export interface UpdateUserParam {
  dept_id?: number | null;
  username: string;
  nickname: string;
  avatar?: string | null;
  email?: string | null;
  phone?: string | null;
  roles: number[];
}

export interface UploadUrl {
  url: string;
}

export type UserPermissionType = 'superuser' | 'staff' | 'status' | 'multi_login';

export type UserSocialType = 'Github' | 'Google';

export interface ValidationError {
  loc: (string | number)[];
  msg: string;
  type: string;
  input?: unknown;
  ctx?: Record<string, unknown>;
}

export interface Links {
  first: string;
  last: string;
  self: string;
  next?: string | null;
  prev?: string | null;
}
