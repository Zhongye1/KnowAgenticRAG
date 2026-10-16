/**
 * 知识库管理接口。
 *
 * 响应类型直接复用 `web/openapi.json` 生成的 `types.gen.ts`：这些端点在契约里已声明
 * 响应模型，字段的必填性与可空性由后端声明，不再按 `knowledge_response.py` 的序列化
 * 结果手写。少数形态（分块行、类型参数、SSE 帧与下载/预览）契约未表达或比 UI 不变式更宽，
 * 仍按下方注释各自保留。
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
import type {
  BatchDeleteDocumentsResponse,
  DepartmentResponse,
  DocumentListResponse,
  DocumentSearchItem,
  DocumentSearchResponse,
  FileMetaItem,
  FolderMetaItem,
  KnowledgeBaseItem,
  KnowledgeBaseStats,
  KnowledgeBaseStatsRepairResponse,
  KnowledgeBaseUpdateResponse,
  MessageResponse,
  OcrEngineItem,
  OcrOptionsResponse,
  PendingTaskResponse,
  QueuedTaskResponse,
  SampleQuestionsGenerateResponse,
  SampleQuestionsResponse,
  SupportedFileTypesResponse,
  UploadFileResponse,
  UserAccessOption as UserAccessOptionModel,
  V2ModelItem,
  V2ModelsResponse,
  VirtualFolderDetectResponse,
  VirtualFolderMigrateResponse,
} from '@/shared/api/generated/types.gen';
import { apiFetch } from '@/shared/api';
import { describeFailure, unwrap, unwrapQueuedTask } from '@/shared/api';
import { processSseResponse } from '@/shared/lib/files';
import type { ShareConfig } from '@/shared/lib/share-config';
import { readFilePreview, type FilePreview } from '../lib/file-preview';
import type { KnowledgeQueryParams } from '../lib/knowledge-query-params';
import { parseDownloadFilename } from '../lib/knowledge-files';

/** 知识库统计；契约生成的 `KnowledgeBaseStats`。 */
export type { KnowledgeBaseStats };

/**
 * 列表与详情共用的知识库投影；保留手写。
 *
 * 契约的 `KnowledgeBaseItem` 把 `embedding_model_spec` / `query_params` / `metadata` /
 * `status` 等声明为必填，而测试与列表/表单组件按部分字段构造这一投影（例如
 * `knowledge-form-dialog.test.tsx` 只给 `kb_id`/`name`/`description`/`kb_type`/`stats`）。
 * 改用生成模型会要求补齐所有构造点，本次不扩大改动面，故继续由这份窄投影拥有。
 */
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

/**
 * 文件表的一行；保留手写。
 *
 * 契约的 `DocumentListItem` 把 `file_type` / `created_at` / `updated_at` / `created_by` /
 * `created_by_name` / `created_by_avatar` / `parent_id` / `path_prefix` 声明为必填（可空），
 * 而文件行的组件与测试按部分字段构造这一投影（`file-row-actions.test.tsx` 等只给子集）。
 * 改用生成模型会要求补齐所有构造点，本次不扩大改动面，故继续由这份投影拥有。
 */
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

/**
 * 文件列表的一页；契约生成的 `DocumentListResponse`。
 *
 * `stats` 只在后端 `include_stats` 打开时出现（默认打开）。
 */
export type KnowledgeFilePage = DocumentListResponse;

/**
 * 后台任务的提交结果；契约生成的 `QueuedTaskResponse`。
 *
 * `queued` 才是受理，后端提交失败时同样返回 200 但 `status` 是 `failed`。
 */
export type KnowledgeTaskResult = QueuedTaskResponse;

/** 删除结果；契约生成的 `MessageResponse`。 */
export type KnowledgeDeleteResult = MessageResponse;

/** 批量删除结果；契约生成的 `BatchDeleteDocumentsResponse`（全部成功时不下发 `failed_items`）。 */
export type KnowledgeBatchDeleteResult = BatchDeleteDocumentsResponse;

/** `POST /files/upload` 的结果；契约生成的 `UploadFileResponse`。 */
export type UploadedKnowledgeFile = UploadFileResponse;

/** OCR 引擎；契约生成的 `OcrEngineItem`。 */
export type OcrEngine = OcrEngineItem;

/** OCR 引擎选项（含默认引擎）；契约生成的 `OcrOptionsResponse`。 */
export type OcrOptions = OcrOptionsResponse;

/** 部门（共享范围选择用）；契约生成的 `DepartmentResponse`。 */
export type DepartmentOption = DepartmentResponse;

/** 可选用户（共享范围选择用）；契约生成的 `UserAccessOption`。 */
export type UserAccessOption = UserAccessOptionModel;

/**
 * 检索测试命中的一个分块；保留手写。
 *
 * 契约的 `KnowledgeQueryResultItem.metadata` 是开放 map（`{[key: string]: unknown}`），
 * `query-test-panel.tsx` 直接把 `metadata.source` / `metadata.file_id` 渲染成文案，
 * 生成模型会在这里退化成 `unknown`。UI 的窄 metadata 投影继续由这份类型拥有。
 */
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

/**
 * 解析出来的一个分块；保留手写而非 `DocumentContentLineItem`。
 *
 * 契约把 `chunk_order_index` 声明为 `number | null`、`tags` 声明为 `unknown`，而合并分块的
 * `mergeChunks` 要求 `chunk_order_index` 非空，这里保留更窄的 UI 不变式。
 */
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

/**
 * 文档内容：`lines` 是分块，`content` 是解析后的 Markdown（没有解析结果时后端不给这个键）。
 *
 * 保留手写而非 `DocumentContentResponse`：`lines` 用上面的窄 `KnowledgeFileChunk`（契约的行
 * 元素更宽），且调用方按 `lines` 一定有值折叠。
 */
export type KnowledgeFileContent = {
  lines: KnowledgeFileChunk[];
  content?: string | null;
  status?: string;
  message?: string;
};

/**
 * 文件名搜索命中；契约生成的 `DocumentSearchItem`。
 *
 * `filename` 是完整相对路径（路径投影的文件带目录前缀），`parent_id` 只在实体目录下才有值，
 * 两者一起用于定位（见 `buildSearchHitLocation`）。
 */
export type KnowledgeFileSearchItem = DocumentSearchItem;

/** 文件名搜索结果；契约生成的 `DocumentSearchResponse`。 */
export type KnowledgeFileSearchResult = DocumentSearchResponse;

/** v2 模型列表里的一个模型；契约生成的 `V2ModelItem`（`spec` 是 `provider_id:model_id`）。 */
export type ModelSpecItem = V2ModelItem;

/** 按 provider 分组的模型；契约生成 `V2ModelsResponse['data']`（列表页与表单的选择项都从这里来）。 */
export type GroupedModels = V2ModelsResponse['data'];

/**
 * 知识库类型的一个创建参数；契约未表达，保留手写。
 *
 * 生成模型 `KnowledgeBaseTypeItem.create_params` 是 `{[key: string]: unknown}`，`options` 里每项
 * 的形状没有进契约，而 `knowledge-form.ts` 按 `key` / `default` / `type` / `required` 等键读取。
 */
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

/**
 * 知识库类型；保留手写而非 `KnowledgeBaseTypeItem`。
 *
 * 生成模型的 `create_params` 是 `{[key: string]: unknown}`，拿不到 `options` 的窄类型；
 * `knowledge-form.ts` 直接消费 `create_params.options`，因此这里继续拥有更窄的形状。
 */
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
   *
   * 响应保留手写的 `{databases?: KnowledgeBase[]}`：列表元素用上面的窄投影
   * `KnowledgeBase`（原因见其定义处），生成模型的 `KnowledgeBaseListResponse` 只到
   * `KnowledgeBaseItem` 一级、装不下这份更窄的列表项类型。
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
   * 契约生成的 `KnowledgeBaseStatsRepairResponse`。
   */
  repairStats: async (
    kbId: string,
  ): Promise<KnowledgeBaseStatsRepairResponse> =>
    unwrap<KnowledgeBaseStatsRepairResponse>(
      await repairDatabaseStatsApiKnowledgeDatabasesKbIdStatsRepairPost({
        path: { kb_id: kbId },
      }),
    ),

  /** 检测知识库里是否还有路径型历史记录（虚拟文件夹）；契约生成的 `VirtualFolderDetectResponse`。 */
  detectVirtualFolders: async (
    kbId: string,
  ): Promise<VirtualFolderDetectResponse> =>
    unwrap<VirtualFolderDetectResponse>(
      await detectVirtualFoldersApiKnowledgeDatabasesKbIdVirtualFoldersDetectGet(
        { path: { kb_id: kbId } },
      ),
    ),

  /**
   * 启动虚拟文件夹转换任务；任务与 SSE 连接解耦，断开不取消。
   * 返回 `task_id`，进度从 `streamVirtualFolderMigration` 读；契约生成的 `VirtualFolderMigrateResponse`。
   */
  startVirtualFolderMigration: async (
    kbId: string,
  ): Promise<VirtualFolderMigrateResponse> =>
    unwrap<VirtualFolderMigrateResponse>(
      await startVirtualFolderMigrationApiKnowledgeDatabasesKbIdVirtualFoldersMigratePost(
        { path: { kb_id: kbId } },
      ),
    ),

  /**
   * 逐帧消费虚拟文件夹转换的进度流。后端按「取任务快照 → 发一帧 → 睡 500ms」循环，
   * 到 `success`/`failed`/`cancelled` 收口；断开连接不取消任务。
   *
   * SSE 帧契约里没有模型（该路由是非 JSON 的流），快照形状保留手写。
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

  /** 提交全部待解析文件的解析任务；契约生成的 `PendingTaskResponse`。 */
  parsePendingDocuments: async (
    kbId: string,
    params: Record<string, unknown> = {},
  ): Promise<PendingTaskResponse> =>
    unwrapQueuedTask(
      unwrap<PendingTaskResponse>(
        await parsePendingDocumentsApiKnowledgeDatabasesKbIdDocumentsParsePendingPost(
          { path: { kb_id: kbId }, body: { params } },
        ),
      ),
      '任务提交失败。',
    ),

  /** 提交全部待入库文件的入库任务；契约生成的 `PendingTaskResponse`。 */
  indexPendingDocuments: async (
    kbId: string,
    params: Record<string, unknown> = {},
  ): Promise<PendingTaskResponse> =>
    unwrapQueuedTask(
      unwrap<PendingTaskResponse>(
        await indexPendingDocumentsApiKnowledgeDatabasesKbIdDocumentsIndexPendingPost(
          { path: { kb_id: kbId }, body: { params } },
        ),
      ),
      '任务提交失败。',
    ),

  /** 新建空文件夹；返回文件夹记录（含 `file_id`），契约生成的 `FolderMetaItem`。 */
  createFolder: async (
    kbId: string,
    folderName: string,
    parentId: string | null,
  ): Promise<FolderMetaItem> =>
    unwrap<FolderMetaItem>(
      await createFolderApiKnowledgeDatabasesKbIdFoldersPost({
        path: { kb_id: kbId },
        body: { folder_name: folderName, parent_id: parentId },
      }),
    ),

  /** 重命名文件夹；只对实体文件夹有效，虚拟目录没有实体记录改不了；契约生成的 `FileMetaItem`。 */
  renameFolder: async (
    kbId: string,
    folderId: string,
    folderName: string,
  ): Promise<FileMetaItem> =>
    unwrap<FileMetaItem>(
      await renameFolderApiKnowledgeDatabasesKbIdFoldersFolderIdRenamePut({
        path: { kb_id: kbId, folder_id: folderId },
        body: { folder_name: folderName },
      }),
    ),

  /**
   * 支持的知识库类型与各自的创建参数。
   *
   * 保留手写响应形状：契约的 `KnowledgeBaseTypesResponse.kb_types` 指向 `KnowledgeBaseTypeItem`，
   * 其 `create_params` 是 `{[key: string]: unknown}`，装不下 `KnowledgeTypeInfo` 的窄 `options`。
   */
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
      return unwrap<DocumentListResponse>(
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

  /** 删除一个文件或文件夹；契约生成的 `MessageResponse`。 */
  deleteDocument: async (
    kbId: string,
    docId: string,
  ): Promise<MessageResponse> =>
    unwrap<MessageResponse>(
      await deleteDocumentApiKnowledgeDatabasesKbIdDocumentsDocIdDelete({
        path: { kb_id: kbId, doc_id: docId },
      }),
    ),

  /** 批量删除；调用方按 50 个一批切分，单批失败不会中断其余批次；契约生成的 `BatchDeleteDocumentsResponse`。 */
  batchDeleteDocuments: async (
    kbId: string,
    fileIds: string[],
  ): Promise<BatchDeleteDocumentsResponse> =>
    unwrap<BatchDeleteDocumentsResponse>(
      await batchDeleteDocumentsApiKnowledgeDatabasesKbIdDocumentsBatchDelete({
        path: { kb_id: kbId },
        body: fileIds,
      }),
    ),

  /** 提交解析任务；参数留空表示按知识库自己的分块与 OCR 配置解析；契约生成的 `QueuedTaskResponse`。 */
  parseDocuments: async (
    kbId: string,
    fileIds: string[],
    params: Record<string, unknown> = {},
  ): Promise<QueuedTaskResponse> =>
    unwrapQueuedTask(
      unwrap<QueuedTaskResponse>(
        await parseDocumentsApiKnowledgeDatabasesKbIdDocumentsParsePost({
          path: { kb_id: kbId },
          body: { file_ids: fileIds, params },
        }),
      ),
      '任务提交失败。',
    ),

  /** 提交入库任务；契约生成的 `QueuedTaskResponse`。 */
  indexDocuments: async (
    kbId: string,
    fileIds: string[],
    params: Record<string, unknown> = {},
  ): Promise<QueuedTaskResponse> =>
    unwrapQueuedTask(
      unwrap<QueuedTaskResponse>(
        await indexDocumentsApiKnowledgeDatabasesKbIdDocumentsIndexPost({
          path: { kb_id: kbId },
          body: { file_ids: fileIds, params },
        }),
      ),
      '任务提交失败。',
    ),

  /** 移动到另一个目录；`newParentId` 为 `null` 表示移到根目录；契约生成的 `FileMetaItem`。 */
  moveDocument: async (
    kbId: string,
    docId: string,
    newParentId: string | null,
  ): Promise<FileMetaItem> =>
    unwrap<FileMetaItem>(
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
   * 同内容再传一次会拿到 409。响应是契约生成的 `UploadFileResponse`。
   */
  uploadFile: async (
    kbId: string,
    file: File,
    filename: string,
  ): Promise<UploadFileResponse> => {
    // 需要改写 multipart 里的文件名（文件夹相对路径）时重建一个 File，字节是共享的
    const body =
      filename && filename !== file.name
        ? new File([file], filename, { type: file.type })
        : file;
    return unwrap<UploadFileResponse>(
      await uploadFileApiKnowledgeFilesUploadPost({
        query: { kb_id: kbId },
        body: { file: body },
      }),
    );
  },

  /** 后端允许上传的文件后缀；拿不到时调用方用兜底白名单；契约生成的 `SupportedFileTypesResponse`。 */
  listSupportedTypes: async (): Promise<string[]> => {
    const result = unwrap<SupportedFileTypesResponse>(
      await getSupportedFileTypesApiKnowledgeFilesSupportedTypesGet(),
    );
    return result.file_types ?? [];
  },

  /** OCR 引擎选项（含默认引擎）；契约生成的 `OcrOptionsResponse`。 */
  listOcrOptions: async (): Promise<OcrOptionsResponse> => {
    const result = unwrap<OcrOptionsResponse>(
      await getOcrEngineOptionsApiSystemOcrOptionsGet(),
    );
    return { ...result, engines: result.engines ?? [] };
  },

  /**
   * 把已上传的对象登记成文档记录，并按 `auto_index` 决定是否连解析与入库一起入队。
   * 后端受理的是三阶段任务，返回 `task_id`；契约生成的 `QueuedTaskResponse`。
   */
  addDocuments: async (
    kbId: string,
    items: string[],
    params: Record<string, unknown>,
  ): Promise<QueuedTaskResponse> =>
    unwrapQueuedTask(
      unwrap<QueuedTaskResponse>(
        await addDocumentsApiKnowledgeDatabasesKbIdDocumentsPost({
          path: { kb_id: kbId },
          body: { items, params },
        }),
      ),
      '任务提交失败。',
    ),

  /** 部门列表；共享范围按部门选择时用；契约生成的 `DepartmentResponse`。 */
  listDepartments: async (): Promise<DepartmentResponse[]> =>
    unwrap<DepartmentResponse[]>(await getDepartmentsApiDepartmentsGet()),

  /** 可选用户列表（后端按当前账号可见范围给）；契约生成的 `UserAccessOption`。 */
  listUserOptions: async (): Promise<UserAccessOption[]> =>
    unwrap<UserAccessOption[]>(
      await readUserAccessOptionsApiAuthUsersAccessOptionsGet(),
    ),

  /**
   * 知识库类型下发的可配置查询参数。
   *
   * 保留手写响应形状：契约的 `QueryParamsConfigResponse.params.options` 是
   * `Array<{[key: string]: unknown}>`，而这里要返回 `knowledge-query-params.ts` 里更窄的
   * `KnowledgeQueryParams`。
   */
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
   * 这里折成异常，界面才不会把失败画成「没有命中」。响应保留手写的窄分块与失败分支，
   * 因为契约的 `metadata` 是开放 map（见 `QueryTestChunk` 的说明）。
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

  /** 知识库的示例问题（可能为空数组）；契约生成的 `SampleQuestionsResponse`。 */
  listSampleQuestions: async (kbId: string): Promise<string[]> => {
    const result = unwrap<SampleQuestionsResponse>(
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
   * 期间调用方要自己表达「正在生成」。响应是契约生成的 `SampleQuestionsGenerateResponse`。
   */
  generateSampleQuestions: async (
    kbId: string,
    count = 10,
  ): Promise<string[]> => {
    const result = unwrap<SampleQuestionsGenerateResponse>(
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
   * 「加载失败」显示成「暂无分块」。响应用窄的 `KnowledgeFileContent`（见其定义处的说明），
   * 而不是契约的 `DocumentContentResponse`。
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

  /** 按文件名搜索（后端只匹配文件名，不搜内容）；契约生成的 `DocumentSearchResponse`。 */
  searchDocuments: async (
    kbId: string,
    params: { query: string; limit?: number },
  ): Promise<DocumentSearchResponse> =>
    unwrap<DocumentSearchResponse>(
      await searchDocumentsApiKnowledgeDatabasesKbIdDocumentsSearchGet({
        path: { kb_id: kbId },
        query: { query: params.query, limit: params.limit ?? 100 },
      }),
    ),

  /** 按类型取模型（知识库表单只需要 `embedding`）；契约生成的 `V2ModelsResponse['data']`。 */
  listModels: async (
    modelType: 'embedding' | 'chat' | 'rerank' = 'embedding',
  ): Promise<GroupedModels> => {
    const response = unwrap<V2ModelsResponse>(
      await getV2ModelsApiSystemModelProvidersModelsV2Get({
        query: { model_type: modelType },
      }),
    );
    return response.data ?? {};
  },

  create: async (payload: CreateKnowledgeBasePayload): Promise<void> => {
    try {
      unwrap<KnowledgeBaseItem>(
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
      unwrap<KnowledgeBaseUpdateResponse>(
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
      unwrap<MessageResponse>(
        await deleteDatabaseApiKnowledgeDatabasesKbIdDelete({
          path: { kb_id: kbId },
        }),
      );
    } catch (error) {
      throw new Error(describeFailure(error, '删除知识库失败。'));
    }
  },
};
