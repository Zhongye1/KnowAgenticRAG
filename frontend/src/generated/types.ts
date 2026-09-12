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

export interface AgentParam {
  query_text: string;
  model?: string | null;
  thinking_level?: string | null;
  history?: ChatMessage[];
  attachments?: ChatAttachment[];
  temperature?: number | null;
  max_tokens?: number | null;
  search_mode?: string | null;
  recall_top_k?: number | null;
  final_top_k?: number | null;
  similarity_threshold?: number | null;
  use_reranker?: boolean | null;
  include_visual?: boolean | null;
  visual_top_k?: number | null;
  file_name?: string | null;
  filters?: RetrievalFilters | null;
  max_steps?: number | null;
  allow_rewrite?: boolean | null;
  max_sub_queries?: number | null;
  min_score?: number | null;
}

export interface AgentPlanInfo {
  need_retrieval?: boolean;
  sub_queries?: string[];
  plan_rationale?: string;
  grade_score?: number;
  rewrites?: number;
  tool_calls?: number;
}

export interface AgentResponse {
  kb_name: string;
  kb_names?: string[];
  mode?: string;
  model_spec?: string;
  hit_count?: number;
  visual_count?: number;
  answer: string;
  reason: string;
  citations?: CitationItem[];
  images?: ImageSourceItem[];
  route: RouteInfoItem;
  steps?: QueryStepItem[];
  agent?: AgentPlanInfo;
  usage?: ChatUsage;
}

export interface AuthLoginParam {
  username: string;
  password: string;
  uuid?: string | null;
  captcha?: string | null;
}

export interface ChatAttachment {
  filename: string;
  content: string;
}

export interface ChatMessage {
  role?: string;
  content: string;
}

export interface ChatParam {
  query_text: string;
  model?: string | null;
  thinking_level?: string | null;
  history?: ChatMessage[];
  attachments?: ChatAttachment[];
  temperature?: number | null;
  max_tokens?: number | null;
  search_mode?: string | null;
  recall_top_k?: number | null;
  final_top_k?: number | null;
  similarity_threshold?: number | null;
  use_reranker?: boolean | null;
  include_visual?: boolean | null;
  visual_top_k?: number | null;
  file_name?: string | null;
  filters?: RetrievalFilters | null;
}

export interface ChatResponse {
  kb_name: string;
  kb_names?: string[];
  mode?: string;
  model_spec?: string;
  hit_count?: number;
  visual_count?: number;
  answer: string;
  reason: string;
  citations?: CitationItem[];
  images?: ImageSourceItem[];
  route: RouteInfoItem;
  steps?: QueryStepItem[];
  usage?: ChatUsage;
}

export interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface ChunkItem {
  chunk_id: string;
  document_id: string;
  kb_name: string;
  plugin_namespace: string;
  version_id: number;
  chunk_index: number;
  content: string;
  token_count?: number | null;
  char_pos_start?: number | null;
  char_pos_end?: number | null;
  meta?: Record<string, unknown>;
  created_time: string;
  updated_time?: string | null;
}

export interface CitationItem {
  n: number;
  kb_name: string;
  document_id: string;
  version_id?: number;
  chunk_id: string;
  source?: string;
  score?: number;
  content: string;
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

export interface DocAclDetail {
  document_id: string;
  kb_name: string;
  visibility: string;
  owner_id?: string | null;
  group_ids?: string[];
}

export interface DocAclUpdateParam {
  visibility?: string | null;
  group_ids?: string[] | null;
}

export interface DocumentItem {
  document_id: string;
  kb_name: string;
  plugin_namespace: string;
  name: string;
  source_type: string;
  source_uri?: string | null;
  pipeline: string;
  status: string;
  sha256?: string | null;
  chunk_count: number;
  active_version: number;
  ingest_params?: Record<string, unknown>;
  error_message?: string | null;
  created_time: string;
  updated_time?: string | null;
}

export interface DocumentStatusItem {
  document_id: string;
  kb_name: string;
  plugin_namespace: string;
  name: string;
  status: string;
  chunk_count?: number;
  error_message?: string | null;
  ingest_params?: Record<string, unknown>;
  created_time: string;
  updated_time?: string | null;
}

export interface DocumentUpdateParam {
  name?: string | null;
  source_type?: string | null;
  pipeline?: string | null;
  status?: string | null;
}

export interface DocumentUploadItem {
  document_id: string;
  kb_name: string;
  name: string;
  status: string;
  sha256?: string | null;
  source_uri?: string | null;
  created_time: string;
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

export interface ImageSourceItem {
  type?: string;
  image_id: string;
  image_path: string;
  document_id: string;
  kb_name: string;
  page?: number;
  position?: string;
  chunk_type?: string;
  parent_section?: string;
  content_summary?: string;
  score?: number;
}

export interface ImageUrlData {
  image_id: string;
  document_id: string;
  kb_name: string;
  url: string;
  expires_in_seconds: number;
}

export interface IngestJobItem {
  job_id: string;
  document_id: string;
  kb_name: string;
  plugin_namespace: string;
  pipeline: string;
  status: string;
  stage?: string | null;
  progress_current?: number;
  progress_total?: number;
  error_message?: string | null;
  logs?: unknown[];
  created_time: string;
  updated_time?: string | null;
}

export interface IngestResultItem {
  document_id: string;
  kb_name: string;
  name: string;
  sha256?: string | null;
  status: string;
  queued?: boolean;
}

export type JsonValue = unknown;

export interface KBAclDetail {
  kb_name: string;
  group_ids?: string[];
}

export interface KBAclUpdateParam {
  group_ids?: string[];
}

export interface KBCollectionsItem {
  collection: string;
  count: number;
}

export interface KBCreateParam {
  kb_name: string;
  display_name: string;
  description?: string;
  theme?: string;
  icon?: string;
  pdf_text_page_ratio?: number;
  embedding_model?: string;
  routing_mode?: string;
  query_params?: Record<string, unknown>;
}

export interface KBDeleteResponse {
  deleted: boolean;
  counts?: Record<string, number>;
}

export interface KBDetail {
  kb_name: string;
  plugin_namespace: string;
  display_name: string;
  description: string;
  theme: string;
  icon: string;
  pdf_text_page_ratio: number;
  embedding_model: string;
  query_params?: Record<string, unknown>;
  collections_used?: string[];
  documents?: number;
  text_vectors?: number;
  visual_vectors?: number;
  created_time: string;
  updated_time?: string | null;
}

export interface KBFacetItem {
  field: string;
  value: string;
  count: number;
}

export interface KBFormatDistributionItem {
  source_type: string;
  count: number;
}

export interface KBIngestionVolumeItem {
  date: string;
  count: number;
}

export interface KBItem {
  kb_name: string;
  plugin_namespace: string;
  display_name: string;
  description: string;
  theme: string;
  icon: string;
  pdf_text_page_ratio: number;
  embedding_model: string;
  query_params?: Record<string, unknown>;
  collections_used?: string[];
  documents?: number;
  text_vectors?: number;
  visual_vectors?: number;
  created_time: string;
  updated_time?: string | null;
}

export interface KBOverview {
  total_kbs: number;
  total_documents: number;
  total_text_vectors: number;
  total_visual_vectors: number;
}

export interface KBUpdateParam {
  routing_mode?: string | null;
  display_name?: string | null;
  description?: string | null;
  theme?: string | null;
  icon?: string | null;
  pdf_text_page_ratio?: number | null;
  embedding_model?: string | null;
  query_params?: Record<string, unknown> | null;
}

export type MenuType = 0 | 1 | 2 | 3 | 4;

export interface ModelItemParam {
  id: string;
  type: string;
  display_name?: string | null;
  dimension?: number | null;
  batch_size?: number | null;
  extra?: Record<string, unknown>;
}

export interface ModelProviderCreateParam {
  provider_id: string;
  display_name: string;
  provider_type?: string;
  base_url?: string;
  embedding_base_url?: string | null;
  rerank_base_url?: string | null;
  api_key?: string | null;
  api_key_env?: string | null;
  capabilities?: string[];
  enabled_models?: ModelItemParam[];
  headers_json?: Record<string, unknown>;
  extra_json?: Record<string, unknown>;
  is_enabled?: boolean;
}

export interface ModelProviderDetail {
  provider_id: string;
  display_name: string;
  provider_type: string;
  base_url: string;
  embedding_base_url?: string | null;
  rerank_base_url?: string | null;
  api_key_env?: string | null;
  api_key_set: boolean;
  capabilities?: string[];
  enabled_models?: Record<string, unknown>[];
  headers_json?: Record<string, unknown>;
  extra_json?: Record<string, unknown>;
  is_enabled?: boolean;
  is_builtin?: boolean;
  created_time: string;
  updated_time?: string | null;
}

export interface ModelProviderUpdateParam {
  display_name?: string | null;
  provider_type?: string | null;
  base_url?: string | null;
  embedding_base_url?: string | null;
  rerank_base_url?: string | null;
  api_key?: string | null;
  api_key_env?: string | null;
  capabilities?: string[] | null;
  enabled_models?: ModelItemParam[] | null;
  headers_json?: Record<string, unknown> | null;
  extra_json?: Record<string, unknown> | null;
  is_enabled?: boolean | null;
}

export type NoticeType = 0 | 1;

export type PeriodType = 'days' | 'hours' | 'minutes' | 'seconds' | 'microseconds';

export interface ProviderConnectivityParam {
  spec: string;
}

export interface ProviderConnectivityResult {
  spec: string;
  status: string;
  message?: string;
  dimension?: number | null;
}

export interface QueryStepItem {
  name: string;
  detail?: string;
}

export interface RagSearchOutput {
  kb_names: string[];
  mode: string;
  route: RouteInfoItem;
  steps?: QueryStepItem[];
  recall_count?: number;
  reranked?: boolean;
  degraded?: boolean;
  visual_degraded?: boolean;
  duration_ms?: number;
  sources?: RagSources;
}

export interface RagSearchParam {
  query_text: string;
  search_mode?: string | null;
  recall_top_k?: number | null;
  final_top_k?: number | null;
  similarity_threshold?: number | null;
  use_reranker?: boolean | null;
  include_visual?: boolean | null;
  visual_top_k?: number | null;
  file_name?: string | null;
  filters?: RetrievalFilters | null;
  kb_names: string[];
  document_ids?: string[] | null;
}

export interface RagSources {
  text?: TextSourceItem[];
  image?: ImageSourceItem[];
}

export interface RebuildResultItem {
  kb_name: string;
  dispatched?: number;
  skipped?: number;
  total?: number;
}

export interface RegisterUserParam {
  username: string;
  password: string;
  nickname?: string | null;
  email?: string | null;
  uuid?: string | null;
  captcha?: string | null;
}

export interface ResetPasswordParam {
  old_password: string;
  new_password: string;
  confirm_password: string;
}

export interface RetrievalFilters {
  keyword?: string | null;
  tag?: string | null;
  version_id?: number | null;
  updated_after?: string | null;
  updated_before?: string | null;
  file_type?: string | null;
  path_prefix?: string | null;
}

export type RoleDataRuleExpressionType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type RoleDataRuleOperatorType = 0 | 1;

export interface RouteInfoItem {
  mode: string;
  selected: string[];
  reason?: string;
  kb_names?: string[];
}

export type StatusType = 0 | 1;

export interface TagItem {
  keyword: string;
  document_count: number;
  kb_names?: string[];
  node_count: number;
}

export interface TaskRegisteredDetail {
  name: string;
  task: string;
}

export type TaskSchedulerType = 0 | 1;

export interface TextSourceItem {
  type?: string;
  chunk_id: string;
  document_id: string;
  kb_name: string;
  version_id?: number;
  chunk_index?: number;
  file_name?: string;
  content: string;
  score?: number;
  rerank_score?: number | null;
  token_count?: number | null;
}

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
