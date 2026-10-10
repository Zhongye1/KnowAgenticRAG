/**
 * 知识库查询与写操作的 React Query 装配。
 *
 * 列表与详情各一份缓存；写操作成功后让列表失效（后端会重算统计，不能就地拼装）。
 */
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import {
  knowledgeApi,
  type KnowledgeFilePage,
  type CreateKnowledgeBasePayload,
  type UpdateKnowledgeBasePayload,
} from '../api/knowledge-api';

export const knowledgeKeys = {
  all: ['knowledge-bases'] as const,
  list: () => [...knowledgeKeys.all, 'list'] as const,
  detail: (kbId: string) => [...knowledgeKeys.all, 'detail', kbId] as const,
  filesRoot: (kbId: string) => [...knowledgeKeys.all, 'files', kbId] as const,
  files: (
    kbId: string,
    parentId: string | null,
    pathPrefix: string,
    status: string,
    page: number,
    pageSize: number,
  ) =>
    [
      ...knowledgeKeys.filesRoot(kbId),
      parentId ?? 'root',
      pathPrefix,
      status,
      page,
      pageSize,
    ] as const,
  fileSearch: (kbId: string, query: string) =>
    [...knowledgeKeys.all, 'file-search', kbId, query] as const,
  filePreview: (kbId: string, fileId: string) =>
    [...knowledgeKeys.all, 'file-preview', kbId, fileId] as const,
  fileContent: (kbId: string, fileId: string) =>
    [...knowledgeKeys.all, 'file-content', kbId, fileId] as const,
  shareTargets: () => [...knowledgeKeys.all, 'share-targets'] as const,
  queryParams: (kbId: string) =>
    [...knowledgeKeys.all, 'query-params', kbId] as const,
  sampleQuestions: (kbId: string) =>
    [...knowledgeKeys.all, 'sample-questions', kbId] as const,
  supportedTypes: () => [...knowledgeKeys.all, 'supported-types'] as const,
  ocrOptions: () => [...knowledgeKeys.all, 'ocr-options'] as const,
  types: () => [...knowledgeKeys.all, 'types'] as const,
  models: (modelType: string) =>
    [...knowledgeKeys.all, 'models', modelType] as const,
};

/** 当前用户可见的知识库列表。 */
export const useKnowledgeBases = () =>
  useQuery({ queryKey: knowledgeKeys.list(), queryFn: knowledgeApi.list });

/** 单个知识库详情：`includeFiles` 默认关闭，文件列表走独立的分页接口。 */
export const useKnowledgeBase = (kbId: string | undefined) =>
  useQuery({
    queryKey: knowledgeKeys.detail(kbId ?? ''),
    queryFn: () => knowledgeApi.get(kbId as string),
    enabled: Boolean(kbId),
  });

/** 文件表的一页；翻页与筛选都体现在 queryKey 上，回退时能直接命中缓存。 */
export const useKnowledgeFiles = (
  kbId: string,
  params: {
    parentId: string | null;
    pathPrefix?: string;
    status: string;
    page: number;
    pageSize: number;
  },
  /** 轮询交给调用方决定（不混进请求参数）：给数值或用查询自己上一份数据判断的函数。 */
  options: {
    refetchInterval?:
      | number
      | false
      | ((query: { state: { data?: KnowledgeFilePage } }) => number | false);
  } = {},
) =>
  useQuery({
    queryKey: knowledgeKeys.files(
      kbId,
      params.parentId,
      params.pathPrefix ?? '',
      params.status,
      params.page,
      params.pageSize,
    ),
    queryFn: () => knowledgeApi.listDocuments(kbId, params),
    // 翻页与换目录时保留上一页，避免整张表先卸载再重建
    placeholderData: keepPreviousData,
    // 有文件在处理中时按 10 秒重取，让解析/入库状态自己走到终态；
    // 页面不可见时 react-query 默认暂停轮询；处理中的行消失后轮询自然停止。
    refetchInterval: options.refetchInterval ?? false,
  });

/** 按文件名搜索；查询为空时不发请求。 */
export const useSearchKnowledgeFiles = (kbId: string, query: string) =>
  useQuery({
    queryKey: knowledgeKeys.fileSearch(kbId, query),
    queryFn: () => knowledgeApi.searchDocuments(kbId, { query }),
    enabled: query.trim().length > 0,
  });

/**
 * 文件写操作成功后要作废的缓存：文件列表覆盖所有目录/筛选/页码键，详情要重算统计卡。
 */
const invalidateFileViews = (
  queryClient: QueryClient,
  kbId: string,
): Promise<void> =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: knowledgeKeys.filesRoot(kbId) }),
    queryClient.invalidateQueries({ queryKey: knowledgeKeys.detail(kbId) }),
  ]).then(() => undefined);

/** 删除一个文件或文件夹。 */
export const useDeleteKnowledgeFile = (kbId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (docId: string) => knowledgeApi.deleteDocument(kbId, docId),
    onSuccess: () => invalidateFileViews(queryClient, kbId),
  });
};

/** 批量删除；调用方保证只传可删除的行。 */
export const useDeleteKnowledgeFiles = (kbId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fileIds: string[]) =>
      knowledgeApi.batchDeleteDocuments(kbId, fileIds),
    onSuccess: () => invalidateFileViews(queryClient, kbId),
  });
};

/** 提交解析任务（含重试解析）。 */
export const useParseKnowledgeFiles = (kbId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fileIds: string[]) =>
      knowledgeApi.parseDocuments(kbId, fileIds),
    onSuccess: () => invalidateFileViews(queryClient, kbId),
  });
};

/** 提交入库任务（含重试入库与重新入库）。 */
export const useIndexKnowledgeFiles = (kbId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fileIds: string[]) =>
      knowledgeApi.indexDocuments(kbId, fileIds),
    onSuccess: () => invalidateFileViews(queryClient, kbId),
  });
};

/** 移动到另一个目录；`newParentId` 为 `null` 表示根目录。 */
export const useMoveKnowledgeFile = (kbId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { fileId: string; newParentId: string | null }) =>
      knowledgeApi.moveDocument(kbId, input.fileId, input.newParentId),
    onSuccess: () => invalidateFileViews(queryClient, kbId),
  });
};

/** 部门与可选用户；共享范围选择用，变动很少。 */
export const useShareTargets = () =>
  useQuery({
    queryKey: knowledgeKeys.shareTargets(),
    queryFn: async () => ({
      departments: await knowledgeApi.listDepartments(),
      users: await knowledgeApi.listUserOptions(),
    }),
    staleTime: 5 * 60 * 1000,
  });

/** 知识库的查询参数配置；检索测试与共享设置都要读它。 */
export const useKnowledgeQueryParams = (kbId: string) =>
  useQuery({
    queryKey: knowledgeKeys.queryParams(kbId),
    queryFn: () => knowledgeApi.getQueryParams(kbId),
  });

/** 示例问题；只在打开检索测试分区时拉。 */
export const useSampleQuestions = (kbId: string, enabled = true) =>
  useQuery({
    queryKey: knowledgeKeys.sampleQuestions(kbId),
    queryFn: () => knowledgeApi.listSampleQuestions(kbId),
    enabled,
  });

/** 后端允许上传的后缀；变动很少，缓存久一点。 */
export const useSupportedFileTypes = () =>
  useQuery({
    queryKey: knowledgeKeys.supportedTypes(),
    queryFn: () => knowledgeApi.listSupportedTypes(),
    staleTime: 30 * 60 * 1000,
  });

/** OCR 引擎选项；同上有变动也很少。 */
export const useOcrOptions = () =>
  useQuery({
    queryKey: knowledgeKeys.ocrOptions(),
    queryFn: () => knowledgeApi.listOcrOptions(),
    staleTime: 30 * 60 * 1000,
  });

/** 上传落库：受理的是三阶段任务，成功后文件列表与详情统计都要重取。 */
export const useAddDocuments = (kbId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { items: string[]; params: Record<string, unknown> }) =>
      knowledgeApi.addDocuments(kbId, input.items, input.params),
    onSuccess: () => invalidateFileViews(queryClient, kbId),
  });
};

/**
 * 文件预览：只有详情弹窗打开时才拉（`enabled`），关闭后组件卸载、缓存按 docId 留着。
 */
export const useFilePreview = (
  kbId: string,
  file: { file_id: string; filename: string } | null,
) =>
  useQuery({
    queryKey: knowledgeKeys.filePreview(kbId, file?.file_id ?? ''),
    queryFn: () =>
      knowledgeApi.previewFile(kbId, file!.file_id, file!.filename),
    enabled: Boolean(file),
  });

/**
 * 分块与解析结果；只在详情弹窗打开、且当前视图确实要看解析内容时才拉
 * （`enabled` 由调用方按视图给）。
 */
export const useFileContent = (
  kbId: string,
  fileId: string | undefined,
  options: { enabled?: boolean } = {},
) =>
  useQuery({
    queryKey: knowledgeKeys.fileContent(kbId, fileId ?? ''),
    queryFn: () => knowledgeApi.getFileContent(kbId, fileId!),
    enabled: Boolean(fileId) && options.enabled !== false,
  });

/** 知识库类型与各自的创建参数；只有新建表单需要，`enabled` 关掉可省一次请求。 */
export const useKnowledgeTypes = (enabled = true) =>
  useQuery({
    queryKey: knowledgeKeys.types(),
    queryFn: knowledgeApi.listTypes,
    staleTime: 5 * 60 * 1000,
    enabled,
  });

/** 可选的嵌入模型（按 provider 分组）。 */
export const useEmbeddingModels = (enabled = true) =>
  useQuery({
    queryKey: knowledgeKeys.models('embedding'),
    queryFn: () => knowledgeApi.listModels('embedding'),
    staleTime: 5 * 60 * 1000,
    enabled,
  });

export const useCreateKnowledgeBase = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateKnowledgeBasePayload) =>
      knowledgeApi.create(payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: knowledgeKeys.list() }),
  });
};

export const useUpdateKnowledgeBase = (kbId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateKnowledgeBasePayload) =>
      knowledgeApi.update(kbId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: knowledgeKeys.list() });
      void queryClient.invalidateQueries({
        queryKey: knowledgeKeys.detail(kbId),
      });
    },
  });
};

export const useDeleteKnowledgeBase = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (kbId: string) => knowledgeApi.remove(kbId),
    onSuccess: (_result, kbId) => {
      void queryClient.invalidateQueries({ queryKey: knowledgeKeys.list() });
      // 详情缓存也要清：删完再后退不能看到缓存里的僵尸详情
      queryClient.removeQueries({ queryKey: knowledgeKeys.detail(kbId) });
    },
  });
};
