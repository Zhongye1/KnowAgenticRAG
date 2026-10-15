/**
 * 知识库管理接口。
 *
 * 契约里这些端点的响应是自由 dict（后端没有 response_model），类型按
 * `backend/server/utils/knowledge_response.py` 的序列化结果与
 * `ars/knowledge/factory.py` 的类型配置手写；改动前先核对那份 Owner。
 */
import {
  addDocumentsApiKnowledgeDatabasesKbIdDocumentsPost,
  batchDeleteDocumentsApiKnowledgeDatabasesKbIdDocumentsBatchDelete,
  createDatabaseApiKnowledgeDatabasesPost,
  createFolderApiKnowledgeDatabasesKbIdFoldersPost,
  deleteDatabaseApiKnowledgeDatabasesKbIdDelete,
  deleteDocumentApiKnowledgeDatabasesKbIdDocumentsDocIdDelete,
  detectVirtualFoldersApiKnowledgeDatabasesKbIdVirtualFoldersDetectGet,
  getDatabaseInfoApiKnowledgeDatabasesKbIdGet,
  getDatabasesApiKnowledgeDatabasesGet,
  getDocumentContentApiKnowledgeDatabasesKbIdDocumentsDocIdContentGet,
  getDepartmentsApiDepartmentsGet,
  getKnowledgeBaseQueryParamsApiKnowledgeDatabasesKbIdQueryParamsGet,
  getOcrEngineOptionsApiSystemOcrOptionsGet,
  getSampleQuestionsApiKnowledgeDatabasesKbIdSampleQuestionsGet,
  generateSampleQuestionsApiKnowledgeDatabasesKbIdSampleQuestionsPost,
  getKnowledgeBaseTypesApiKnowledgeTypesGet,
  indexDocumentsApiKnowledgeDatabasesKbIdDocumentsIndexPost,
  indexPendingDocumentsApiKnowledgeDatabasesKbIdDocumentsIndexPendingPost,
  listDocumentsApiKnowledgeDatabasesKbIdDocumentsGet,
  moveDocumentApiKnowledgeDatabasesKbIdDocumentsDocIdMovePut,
  getSupportedFileTypesApiKnowledgeFilesSupportedTypesGet,
  parseDocumentsApiKnowledgeDatabasesKbIdDocumentsParsePost,
  parsePendingDocumentsApiKnowledgeDatabasesKbIdDocumentsParsePendingPost,
  queryTestApiKnowledgeDatabasesKbIdQueryTestPost,
  readUserAccessOptionsApiAuthUsersAccessOptionsGet,
  renameFolderApiKnowledgeDatabasesKbIdFoldersFolderIdRenamePut,
  repairDatabaseStatsApiKnowledgeDatabasesKbIdStatsRepairPost,
  searchDocumentsApiKnowledgeDatabasesKbIdDocumentsSearchGet,
  startVirtualFolderMigrationApiKnowledgeDatabasesKbIdVirtualFoldersMigratePost,
  uploadFileApiKnowledgeFilesUploadPost,
  getV2ModelsApiSystemModelProvidersModelsV2Get,
  updateDatabaseInfoApiKnowledgeDatabasesKbIdPut,
} from '@/shared/api/generated/sdk.gen';
import { apiFetch } from '@/shared/api';
import { describeFailure, unwrap, unwrapQueuedTask } from '@/shared/api';
import { processSseResponse } from '@/shared/lib/files';
import type { ShareConfig } from '@/shared/lib/share-config';
import { readFilePreview, type FilePreview } from '../lib/file-preview';
import type { KnowledgeQueryParams } from '../lib/knowledge-query-params';
import { parseDownloadFilename } from '../lib/knowledge-files';

/** 知识库统计；字段与后端 `_knowledge_base_stats` 一致。 */
export type KnowledgeBaseStats = {
  file_count: number;
  folder_count: number;
  row_count: number;
  total_size: number;
  chunk_count: number;
  token_count: number;
  pending_parse_count: number;
  pending_index_count: number;
  processing_count: number;
};

/** 列表与详情共用的知识库投影。 */
export type KnowledgeBase = {
  kb_id: string;
  name: string;
  description: string;
  kb_type: string;
  embedding_model_spec?: string | null;
  llm_model_spec?: string | null;
  query_params?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  created_by?: string | null;
  created_at?: string | null;
  status?: string;
  stats: KnowledgeBaseStats;
  row_count?: number;
  share_config?: ShareConfig | null;
  additional_params?: Record<string, unknown>;
  /** 当前用户对它的有效权限；后端解析后给出。 */
  effective_permission?: string;
  can_manage?: boolean;
};

/** 详情比列表多出的字段（`?include_files` 打开时才有 files）。 */
export type KnowledgeBaseDetail = KnowledgeBase & {
  mindmap?: Record<string, unknown> | null;
  sample_questions?: string[];
  files?: unknown[];
  files_truncated?: boolean;
  files_page_size?: number;
};

/**
 * version 2 的共享范围；`manage_scope` 为 null 表示不额外授予管理。
 *
 * 类型与纯规则由 `shared/lib/share-config.ts` 拥有（知识库、技能安装流与技能详情页共用）。
 */
export type { ShareConfig, ShareScope } from '@/shared/lib/share-config';

/** 文件表的一行；字段与 `KnowledgeBaseManager._file_record_list_item` 一一对应。 */
export type KnowledgeFileItem = {
  file_id: string;
  filename: string;
  file_type?: string | null;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
  file_size: number;
  chunk_count: number;
  token_count: number;
  created_by?: string | null;
  created_by_name?: string | null;
  /** 头像地址；界面只显示创建人名称。 */
  created_by_avatar?: string | null;
  is_folder: boolean;
  parent_id?: string | null;
  has_children: boolean;
  children_count: number;
  has_original_file: boolean;
  has_parsed_markdown: boolean;
  is_virtual_folder: boolean;
  path_prefix?: string | null;
};

/** 文件列表的一页：`stats` 只在后端 `include_stats` 打开时出现（默认打开）。 */
export type KnowledgeFilePage = {
  items: KnowledgeFileItem[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
  parent_id?: string | null;
  path_prefix?: string | null;
  recursive?: boolean;
  stats?: KnowledgeBaseStats;
};

/**
 * 后台任务的提交结果：`queued` 才是受理，后端提交失败时同样返回 200 但 `status` 是 `failed`。
 */
export type KnowledgeTaskResult = {
  message: string;
  status: string;
  task_id?: string | null;
};

export type KnowledgeDeleteResult = { message: string };

/** 批量删除结果：部分失败时 `failed_items` 非空，全部失败时后端直接返回 400。 */
export type KnowledgeBatchDeleteResult = {
  message: string;
  deleted_count: number;
  failed_items?: Array<{ doc_id: string; error: string }>;
};

/** `POST /files/upload` 的结果；`file_path` 是 MinIO URL，落库时要连同 `content_hash` 一起回传。 */
export type UploadedKnowledgeFile = {
  file_path: string;
  content_hash: string;
  filename: string;
  size?: number | null;
  /** 知识库里已有同名文件时后端会带上这个标记与列表。 */
  has_same_name?: boolean;
  same_name_files?: string[];
  message?: string;
};

/** OCR 引擎；`supported_extensions` 是该引擎自己能吃的后缀。 */
export type OcrEngine = {
  engine_id: string;
  service_name?: string | null;
  display_name?: string | null;
  supported_extensions?: string[] | null;
};

export type OcrOptions = {
  default_engine?: string | null;
  engines: OcrEngine[];
};

/** 部门（共享范围选择用）。 */
export type DepartmentOption = {
  id: number;
  name: string;
  description?: string | null;
  user_count?: number | null;
};

/** 可选用户（共享范围选择用）。 */
export type UserAccessOption = {
  uid: string;
  username: string;
  role?: string | null;
  department_id?: number | null;
  department_name?: string | null;
};

/** 检索测试命中的一个分块。 */
export type QueryTestChunk = {
  content: string;
  score?: number | null;
  rerank_score?: number | null;
  distance?: number | null;
  metadata?: {
    source?: string | null;
    file_id?: string | null;
    chunk_index?: number | null;
  } | null;
};

/** 解析出来的一个分块；字段与 `_get_file_content_from_meta` 一致（后端会剔掉图谱内部字段）。 */
export type KnowledgeFileChunk = {
  id: string;
  content: string;
  chunk_order_index: number;
  start_char_pos?: number | null;
  end_char_pos?: number | null;
  start_token_pos?: number | null;
  end_token_pos?: number | null;
  graph_indexed?: boolean | null;
  tags?: string[] | null;
};

/** 文档内容：`lines` 是分块，`content` 是解析后的 Markdown（没有解析结果时后端不给这个键）。 */
export type KnowledgeFileContent = {
  lines: KnowledgeFileChunk[];
  content?: string | null;
  status?: string;
  message?: string;
};

/**
 * 文件名搜索命中；`filename` 是完整相对路径（路径投影的文件带目录前缀），
 * `parent_id` 只在实体目录下才有值，两者一起用于定位（见 `buildSearchHitLocation`）。
 */
export type KnowledgeFileSearchItem = {
  kb_id: string;
  kb_name?: string | null;
  file_id: string;
  filename: string;
  file_type?: string | null;
  /** 后端原样透出 `status`，旧数据可能为空。 */
  status: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  file_size?: number | null;
  parent_id?: string | null;
};

export type KnowledgeFileSearchResult = {
  files: KnowledgeFileSearchItem[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
};

/** v2 模型列表里的一个模型；`spec` 是 `provider_id:model_id`。 */
export type ModelSpecItem = {
  spec: string;
  model_id: string;
  display_name?: string | null;
  dimension?: number | null;
};

/** 按 provider 分组的模型；列表页与表单的选择项都从这里来。 */
export type GroupedModels = Record<
  string,
  {
    provider_id: string;
    provider_display_name: string;
    models: ModelSpecItem[];
  }
>;

/** 知识库类型的一个创建参数（后端 `create_params.options` 的一项）。 */
export type KnowledgeTypeParam = {
  key: string;
  label?: string;
  type?: 'text' | 'password' | 'number' | 'boolean';
  required?: boolean;
  default?: unknown;
  placeholder?: string;
  description?: string;
  min?: number;
  max?: number;
};

export type KnowledgeTypeInfo = {
  name: string;
  description?: string;
  requires_embedding_model?: boolean;
  supports_documents?: boolean;
  create_params?: { options?: KnowledgeTypeParam[] };
};

export type CreateKnowledgeBasePayload = {
  database_name: string;
  description: string;
  kb_type: string;
  additional_params?: Record<string, unknown>;
  embedding_model_spec?: string;
  llm_model_spec?: string | null;
  share_config?: ShareConfig | null;
};

/** 更新请求：`name` 与 `description` 是后端必填字段，其余可省略。 */
export type UpdateKnowledgeBasePayload = {
  name: string;
  description: string;
  llm_model_spec?: string | null;
  additional_params?: Record<string, unknown>;
  share_config?: ShareConfig | null;
};

export const knowledgeApi = {
  /**
   * 全部知识库（后端按用户权限过滤；管理员看全部）。
   * 注意：后端把列表异常折成 200 + `{databases: [], message}`，因此「接口失败」在
   * 这里表现为空列表；真正的失败信号要等后端改成非 2xx。
   */
  list: async (): Promise<KnowledgeBase[]> => {
    const response = unwrap<{ databases?: KnowledgeBase[] }>(
      await getDatabasesApiKnowledgeDatabasesGet(),
    );
    return response.databases ?? [];
  },

  /** 单个知识库详情；`includeFiles` 默认关闭，大知识库不要打开。 */
  get: async (
    kbId: string,
    options: { includeFiles?: boolean } = {},
  ): Promise<KnowledgeBaseDetail> =>
    unwrap<KnowledgeBaseDetail>(
      await getDatabaseInfoApiKnowledgeDatabasesKbIdGet({
        path: { kb_id: kbId },
        query: options.includeFiles ? { include_files: true } : {},
      }),
    ),

  /**
   * 修复历史文件缺失的 Chunk/Token 统计，返回修复了几个文件并带回重算后的统计。
   * 字段按 `ars/knowledge/base.py` 的 `repair_missing_file_stats` 返回值手写。
   */
  repairStats: async (
    kbId: string,
  ): Promise<{
    stats: KnowledgeBaseStats;
    updated_chunk_files: number;
    updated_token_files: number;
    updated_size_files: number;
  }> =>
    unwrap(
      await repairDatabaseStatsApiKnowledgeDatabasesKbIdStatsRepairPost({
        path: { kb_id: kbId },
      }),
    ),

  /** 检测知识库里是否还有路径型历史记录（虚拟文件夹）。 */
  detectVirtualFolders: async (
    kbId: string,
  ): Promise<{
    has_virtual_folders: boolean;
    file_count: number;
    remaining_steps: number;
  }> =>
    unwrap(
      await detectVirtualFoldersApiKnowledgeDatabasesKbIdVirtualFoldersDetectGet(
        { path: { kb_id: kbId } },
      ),
    ),

  /**
   * 启动虚拟文件夹转换任务；任务与 SSE 连接解耦，断开不取消。
   * 返回 `task_id`，进度从 `streamVirtualFolderMigration` 读。
   */
  startVirtualFolderMigration: async (
    kbId: string,
  ): Promise<{ task_id: string; created: boolean }> =>
    unwrap(
      await startVirtualFolderMigrationApiKnowledgeDatabasesKbIdVirtualFoldersMigratePost(
        { path: { kb_id: kbId } },
      ),
    ),

  /**
   * 逐帧消费虚拟文件夹转换的进度流。后端按「取任务快照 → 发一帧 → 睡 500ms」循环，
   * 到 `success`/`failed`/`cancelled` 收口；断开连接不取消任务。
   */
  streamVirtualFolderMigration: async (
    kbId: string,
    taskId: string,
    onEvent: (snapshot: {
      status: string;
      progress?: number;
      message?: string;
    }) => void,
  ): Promise<void> => {
    const response = await apiFetch(
      `/api/knowledge/databases/${encodeURIComponent(kbId)}/virtual-folders/migrations/${encodeURIComponent(taskId)}/events`,
    );
    await processSseResponse(response, (_event, data) => {
      if (data && typeof data === 'object') {
        onEvent(
          data as { status: string; progress?: number; message?: string },
        );
      }
    });
  },

  /** 提交全部待解析文件的解析任务。 */
  parsePendingDocuments: async (
    kbId: string,
    params: Record<string, unknown> = {},
  ): Promise<KnowledgeTaskResult> =>
    unwrapQueuedTask(
      unwrap<KnowledgeTaskResult>(
        await parsePendingDocumentsApiKnowledgeDatabasesKbIdDocumentsParsePendingPost(
          { path: { kb_id: kbId }, body: { params } },
        ),
      ),
      '任务提交失败。',
    ),

  /** 提交全部待入库文件的入库任务。 */
  indexPendingDocuments: async (
    kbId: string,
    params: Record<string, unknown> = {},
  ): Promise<KnowledgeTaskResult> =>
    unwrapQueuedTask(
      unwrap<KnowledgeTaskResult>(
        await indexPendingDocumentsApiKnowledgeDatabasesKbIdDocumentsIndexPendingPost(
          { path: { kb_id: kbId }, body: { params } },
        ),
      ),
      '任务提交失败。',
    ),

  /** 新建空文件夹；返回文件夹记录（含 `file_id`），字段按后端 `_serialize_file`。 */
  createFolder: async (
    kbId: string,
    folderName: string,
    parentId: string | null,
  ): Promise<KnowledgeFileItem> =>
    unwrap<KnowledgeFileItem>(
      await createFolderApiKnowledgeDatabasesKbIdFoldersPost({
        path: { kb_id: kbId },
        body: { folder_name: folderName, parent_id: parentId },
      }),
    ),

  /** 重命名文件夹；只对实体文件夹有效，虚拟目录没有实体记录改不了。 */
  renameFolder: async (
    kbId: string,
    folderId: string,
    folderName: string,
  ): Promise<KnowledgeFileItem> =>
    unwrap<KnowledgeFileItem>(
      await renameFolderApiKnowledgeDatabasesKbIdFoldersFolderIdRenamePut({
        path: { kb_id: kbId, folder_id: folderId },
        body: { folder_name: folderName },
      }),
    ),

  /** 支持的知识库类型与各自的创建参数。 */
  listTypes: async (): Promise<Record<string, KnowledgeTypeInfo>> => {
    const response = unwrap<{ kb_types?: Record<string, KnowledgeTypeInfo> }>(
      await getKnowledgeBaseTypesApiKnowledgeTypesGet(),
    );
    return response.kb_types ?? {};
  },

  /** 分页取文件列表；`parentId` 为空表示根目录，`status` 为 `all` 表示不筛。 */ listDocuments:
    async (
      kbId: string,
      params: {
        parentId?: string | null;
        /** 虚拟目录（来源路径投影）的前缀；只在非递归时生效。 */
        pathPrefix?: string;
        status?: string;
        page?: number;
        pageSize?: number;
      } = {},
    ): Promise<KnowledgeFilePage> => {
      const page = params.page ?? 1;
      const pageSize = params.pageSize ?? 100;
      const status = params.status ?? 'all';
      // 只有筛状态时才跨目录；递归查询会忽略父目录与路径前缀
      const recursive = status !== 'all';
      return unwrap<KnowledgeFilePage>(
        await listDocumentsApiKnowledgeDatabasesKbIdDocumentsGet({
          path: { kb_id: kbId },
          query: {
            ...(recursive
              ? {}
              : {
                  ...(params.parentId ? { parent_id: params.parentId } : {}),
                  ...(params.pathPrefix
                    ? { path_prefix: params.pathPrefix }
                    : {}),
                }),
            status,
            page,
            page_size: pageSize,
            recursive,
          },
        }),
      );
    },

  /** 删除一个文件或文件夹。 */
  deleteDocument: async (
    kbId: string,
    docId: string,
  ): Promise<KnowledgeDeleteResult> =>
    unwrap<KnowledgeDeleteResult>(
      await deleteDocumentApiKnowledgeDatabasesKbIdDocumentsDocIdDelete({
        path: { kb_id: kbId, doc_id: docId },
      }),
    ),

  /** 批量删除；调用方按 50 个一批切分，单批失败不会中断其余批次。 */
  batchDeleteDocuments: async (
    kbId: string,
    fileIds: string[],
  ): Promise<KnowledgeBatchDeleteResult> =>
    unwrap<KnowledgeBatchDeleteResult>(
      await batchDeleteDocumentsApiKnowledgeDatabasesKbIdDocumentsBatchDelete({
        path: { kb_id: kbId },
        body: fileIds,
      }),
    ),

  /** 提交解析任务；参数留空表示按知识库自己的分块与 OCR 配置解析。 */
  parseDocuments: async (
    kbId: string,
    fileIds: string[],
    params: Record<string, unknown> = {},
  ): Promise<KnowledgeTaskResult> =>
    unwrapQueuedTask(
      unwrap<KnowledgeTaskResult>(
        await parseDocumentsApiKnowledgeDatabasesKbIdDocumentsParsePost({
          path: { kb_id: kbId },
          body: { file_ids: fileIds, params },
        }),
      ),
      '任务提交失败。',
    ),

  /** 提交入库任务。 */
  indexDocuments: async (
    kbId: string,
    fileIds: string[],
    params: Record<string, unknown> = {},
  ): Promise<KnowledgeTaskResult> =>
    unwrapQueuedTask(
      unwrap<KnowledgeTaskResult>(
        await indexDocumentsApiKnowledgeDatabasesKbIdDocumentsIndexPost({
          path: { kb_id: kbId },
          body: { file_ids: fileIds, params },
        }),
      ),
      '任务提交失败。',
    ),

  /** 移动到另一个目录；`newParentId` 为 `null` 表示移到根目录。 */
  moveDocument: async (
    kbId: string,
    docId: string,
    newParentId: string | null,
  ): Promise<{ message?: string }> =>
    unwrap<{ message?: string }>(
      await moveDocumentApiKnowledgeDatabasesKbIdDocumentsDocIdMovePut({
        path: { kb_id: kbId, doc_id: docId },
        body: { new_parent_id: newParentId },
      }),
    ),

  /**
   * 下载原始文件。
   *
   * 走手写层：需要响应头里的文件名（后端对非 ASCII 名走 RFC 5987 的
   * `filename*=UTF-8''…`），生成物只给解析后的响应体。
   */
  downloadDocument: async (
    kbId: string,
    docId: string,
  ): Promise<{ blob: Blob; filename: string | null }> => {
    const response = await apiFetch(
      `/api/knowledge/databases/${encodeURIComponent(kbId)}/documents/${encodeURIComponent(docId)}/download`,
    );
    return {
      blob: await response.blob(),
      filename: parseDownloadFilename(
        response.headers.get('content-disposition'),
      ),
    };
  },

  /**
   * 上传一个文件到知识库的 MinIO 目录。
   *
   * 只写对象存储、不建记录；文件夹上传要把相对路径当文件名传进来（后端据此投影目录）。
   * 同内容再传一次会拿到 409。
   */
  uploadFile: async (
    kbId: string,
    file: File,
    filename: string,
  ): Promise<UploadedKnowledgeFile> => {
    // 需要改写 multipart 里的文件名（文件夹相对路径）时重建一个 File，字节是共享的
    const body =
      filename && filename !== file.name
        ? new File([file], filename, { type: file.type })
        : file;
    return unwrap<UploadedKnowledgeFile>(
      await uploadFileApiKnowledgeFilesUploadPost({
        query: { kb_id: kbId },
        body: { file: body },
      }),
    );
  },

  /** 后端允许上传的文件后缀；拿不到时调用方用兜底白名单。 */
  listSupportedTypes: async (): Promise<string[]> => {
    const result = unwrap<{ file_types?: string[] }>(
      await getSupportedFileTypesApiKnowledgeFilesSupportedTypesGet(),
    );
    return result.file_types ?? [];
  },

  /** OCR 引擎选项（含默认引擎）。 */
  listOcrOptions: async (): Promise<OcrOptions> => {
    const result = unwrap<OcrOptions>(
      await getOcrEngineOptionsApiSystemOcrOptionsGet(),
    );
    return { ...result, engines: result.engines ?? [] };
  },

  /**
   * 把已上传的对象登记成文档记录，并按 `auto_index` 决定是否连解析与入库一起入队。
   * 后端受理的是三阶段任务，返回 `task_id`。
   */
  addDocuments: async (
    kbId: string,
    items: string[],
    params: Record<string, unknown>,
  ): Promise<KnowledgeTaskResult> =>
    unwrapQueuedTask(
      unwrap<KnowledgeTaskResult>(
        await addDocumentsApiKnowledgeDatabasesKbIdDocumentsPost({
          path: { kb_id: kbId },
          body: { items, params },
        }),
      ),
      '任务提交失败。',
    ),

  /** 部门列表；共享范围按部门选择时用。 */
  listDepartments: async (): Promise<DepartmentOption[]> =>
    unwrap<DepartmentOption[]>(await getDepartmentsApiDepartmentsGet()),

  /** 可选用户列表（后端按当前账号可见范围给）。 */
  listUserOptions: async (): Promise<UserAccessOption[]> =>
    unwrap<UserAccessOption[]>(
      await readUserAccessOptionsApiAuthUsersAccessOptionsGet(),
    ),

  /** 知识库类型下发的可配置查询参数。 */
  getQueryParams: async (kbId: string): Promise<KnowledgeQueryParams> => {
    const result = unwrap<{ params?: KnowledgeQueryParams }>(
      await getKnowledgeBaseQueryParamsApiKnowledgeDatabasesKbIdQueryParamsGet({
        path: { kb_id: kbId },
      }),
    );
    return result.params ?? { options: [] };
  },

  /**
   * 检索测试。
   *
   * 成功时后端直接返回命中分块数组；失败时返回 200 + `{status:'failed', message}`，
   * 这里折成异常，界面才不会把失败画成「没有命中」。
   */
  queryTest: async (
    kbId: string,
    query: string,
    meta: Record<string, unknown>,
  ): Promise<QueryTestChunk[]> => {
    const result = unwrap<
      QueryTestChunk[] | { status?: string; message?: string }
    >(
      await queryTestApiKnowledgeDatabasesKbIdQueryTestPost({
        path: { kb_id: kbId },
        body: { query, meta },
      }),
    );
    if (!Array.isArray(result)) {
      throw new Error(result?.message || '检索测试失败。');
    }
    return result;
  },

  /** 知识库的示例问题（可能为空数组）。 */
  listSampleQuestions: async (kbId: string): Promise<string[]> => {
    const result = unwrap<{ questions?: string[] }>(
      await getSampleQuestionsApiKnowledgeDatabasesKbIdSampleQuestionsGet({
        path: { kb_id: kbId },
      }),
    );
    return result.questions ?? [];
  },

  /**
   * 生成示例问题。
   *
   * 写操作：后端要求知识库管理权限，界面由 `can_manage` 把关。生成走模型，可能几十秒，
   * 期间调用方要自己表达「正在生成」。
   */
  generateSampleQuestions: async (
    kbId: string,
    count = 10,
  ): Promise<string[]> => {
    const result = unwrap<{ questions?: string[] }>(
      await generateSampleQuestionsApiKnowledgeDatabasesKbIdSampleQuestionsPost(
        {
          path: { kb_id: kbId },
          body: { count },
        },
      ),
    );
    return result.questions ?? [];
  },

  /**
   * 文档的分块与解析结果。
   *
   * 后端出错也返回 200 + `{status:'failed'}`，这里折成异常，界面才不会把
   * 「加载失败」显示成「暂无分块」。
   */
  getFileContent: async (
    kbId: string,
    docId: string,
  ): Promise<KnowledgeFileContent> => {
    const result = unwrap<KnowledgeFileContent>(
      await getDocumentContentApiKnowledgeDatabasesKbIdDocumentsDocIdContentGet(
        {
          path: { kb_id: kbId, doc_id: docId },
        },
      ),
    );
    if (result.status === 'failed') {
      throw new Error(result.message || '加载解析内容失败。');
    }
    return { ...result, lines: result.lines ?? [] };
  },

  /**
   * 文件预览。
   *
   * 走手写层：文本类回 JSON，二进制类回 inline 流 + `X-Ars-Preview-Type` 头，
   * 生成物只给解析后的响应体。`fallbackFilename` 用于响应没带文件名时兜底。
   */
  previewFile: async (
    kbId: string,
    fileId: string,
    fallbackFilename: string,
  ): Promise<FilePreview> => {
    const response = await apiFetch(
      `/api/workspace/knowledge/file?kb_id=${encodeURIComponent(kbId)}&file_id=${encodeURIComponent(fileId)}`,
    );
    return readFilePreview(response, { filename: fallbackFilename });
  },

  /** 按文件名搜索（后端只匹配文件名，不搜内容）。 */
  searchDocuments: async (
    kbId: string,
    params: { query: string; limit?: number },
  ): Promise<KnowledgeFileSearchResult> =>
    unwrap<KnowledgeFileSearchResult>(
      await searchDocumentsApiKnowledgeDatabasesKbIdDocumentsSearchGet({
        path: { kb_id: kbId },
        query: { query: params.query, limit: params.limit ?? 100 },
      }),
    ),

  /** 按类型取模型（知识库表单只需要 `embedding`）。 */
  listModels: async (
    modelType: 'embedding' | 'chat' | 'rerank' = 'embedding',
  ): Promise<GroupedModels> => {
    const response = unwrap<{ data?: GroupedModels }>(
      await getV2ModelsApiSystemModelProvidersModelsV2Get({
        query: { model_type: modelType },
      }),
    );
    return response.data ?? {};
  },

  create: async (payload: CreateKnowledgeBasePayload): Promise<void> => {
    try {
      unwrap<unknown>(
        await createDatabaseApiKnowledgeDatabasesPost({ body: payload }),
      );
    } catch (error) {
      throw new Error(describeFailure(error, '创建知识库失败。'));
    }
  },

  update: async (
    kbId: string,
    payload: UpdateKnowledgeBasePayload,
  ): Promise<void> => {
    try {
      unwrap<unknown>(
        await updateDatabaseInfoApiKnowledgeDatabasesKbIdPut({
          path: { kb_id: kbId },
          body: payload,
        }),
      );
    } catch (error) {
      throw new Error(describeFailure(error, '保存知识库失败。'));
    }
  },

  remove: async (kbId: string): Promise<void> => {
    try {
      unwrap<unknown>(
        await deleteDatabaseApiKnowledgeDatabasesKbIdDelete({
          path: { kb_id: kbId },
        }),
      );
    } catch (error) {
      throw new Error(describeFailure(error, '删除知识库失败。'));
    }
  },
};
