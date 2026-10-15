import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api, fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  api: {
    listDatabases: vi.fn(),
    getDatabase: vi.fn(),
    createDatabase: vi.fn(),
    updateDatabase: vi.fn(),
    deleteDatabase: vi.fn(),
    listTypes: vi.fn(),
    listModels: vi.fn(),
    listDocuments: vi.fn(),
    searchDocuments: vi.fn(),
    deleteDocument: vi.fn(),
    batchDeleteDocuments: vi.fn(),
    parseDocuments: vi.fn(),
    indexDocuments: vi.fn(),
    moveDocument: vi.fn(),
    fileContent: vi.fn(),
    uploadFile: vi.fn(),
    supportedTypes: vi.fn(),
    ocrOptions: vi.fn(),
    addDocuments: vi.fn(),
    queryParams: vi.fn(),
    queryTest: vi.fn(),
    sampleQuestions: vi.fn(),
    repairStats: vi.fn(),
    detectVirtualFolders: vi.fn(),
    startVirtualFolderMigration: vi.fn(),
    parsePendingDocuments: vi.fn(),
    indexPendingDocuments: vi.fn(),
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
  },
}));

vi.mock('@/shared/api/generated/sdk.gen', () => ({
  getDatabasesApiKnowledgeDatabasesGet: (...args: unknown[]) =>
    api.listDatabases(...args),
  getDatabaseInfoApiKnowledgeDatabasesKbIdGet: (...args: unknown[]) =>
    api.getDatabase(...args),
  createDatabaseApiKnowledgeDatabasesPost: (...args: unknown[]) =>
    api.createDatabase(...args),
  updateDatabaseInfoApiKnowledgeDatabasesKbIdPut: (...args: unknown[]) =>
    api.updateDatabase(...args),
  deleteDatabaseApiKnowledgeDatabasesKbIdDelete: (...args: unknown[]) =>
    api.deleteDatabase(...args),
  getKnowledgeBaseTypesApiKnowledgeTypesGet: (...args: unknown[]) =>
    api.listTypes(...args),
  getV2ModelsApiSystemModelProvidersModelsV2Get: (...args: unknown[]) =>
    api.listModels(...args),
  listDocumentsApiKnowledgeDatabasesKbIdDocumentsGet: (...args: unknown[]) =>
    api.listDocuments(...args),
  searchDocumentsApiKnowledgeDatabasesKbIdDocumentsSearchGet: (
    ...args: unknown[]
  ) => api.searchDocuments(...args),
  deleteDocumentApiKnowledgeDatabasesKbIdDocumentsDocIdDelete: (
    ...args: unknown[]
  ) => api.deleteDocument(...args),
  batchDeleteDocumentsApiKnowledgeDatabasesKbIdDocumentsBatchDelete: (
    ...args: unknown[]
  ) => api.batchDeleteDocuments(...args),
  parseDocumentsApiKnowledgeDatabasesKbIdDocumentsParsePost: (
    ...args: unknown[]
  ) => api.parseDocuments(...args),
  indexDocumentsApiKnowledgeDatabasesKbIdDocumentsIndexPost: (
    ...args: unknown[]
  ) => api.indexDocuments(...args),
  moveDocumentApiKnowledgeDatabasesKbIdDocumentsDocIdMovePut: (
    ...args: unknown[]
  ) => api.moveDocument(...args),
  getDocumentContentApiKnowledgeDatabasesKbIdDocumentsDocIdContentGet: (
    ...args: unknown[]
  ) => api.fileContent(...args),
  uploadFileApiKnowledgeFilesUploadPost: (...args: unknown[]) =>
    api.uploadFile(...args),
  getSupportedFileTypesApiKnowledgeFilesSupportedTypesGet: (
    ...args: unknown[]
  ) => api.supportedTypes(...args),
  getOcrEngineOptionsApiSystemOcrOptionsGet: (...args: unknown[]) =>
    api.ocrOptions(...args),
  addDocumentsApiKnowledgeDatabasesKbIdDocumentsPost: (...args: unknown[]) =>
    api.addDocuments(...args),
  getKnowledgeBaseQueryParamsApiKnowledgeDatabasesKbIdQueryParamsGet: (
    ...args: unknown[]
  ) => api.queryParams(...args),
  queryTestApiKnowledgeDatabasesKbIdQueryTestPost: (...args: unknown[]) =>
    api.queryTest(...args),
  getSampleQuestionsApiKnowledgeDatabasesKbIdSampleQuestionsGet: (
    ...args: unknown[]
  ) => api.sampleQuestions(...args),
  repairDatabaseStatsApiKnowledgeDatabasesKbIdStatsRepairPost: (
    ...args: unknown[]
  ) => api.repairStats(...args),
  detectVirtualFoldersApiKnowledgeDatabasesKbIdVirtualFoldersDetectGet: (
    ...args: unknown[]
  ) => api.detectVirtualFolders(...args),
  startVirtualFolderMigrationApiKnowledgeDatabasesKbIdVirtualFoldersMigratePost:
    (...args: unknown[]) => api.startVirtualFolderMigration(...args),
  parsePendingDocumentsApiKnowledgeDatabasesKbIdDocumentsParsePendingPost: (
    ...args: unknown[]
  ) => api.parsePendingDocuments(...args),
  indexPendingDocumentsApiKnowledgeDatabasesKbIdDocumentsIndexPendingPost: (
    ...args: unknown[]
  ) => api.indexPendingDocuments(...args),
  createFolderApiKnowledgeDatabasesKbIdFoldersPost: (...args: unknown[]) =>
    api.createFolder(...args),
  renameFolderApiKnowledgeDatabasesKbIdFoldersFolderIdRenamePut: (
    ...args: unknown[]
  ) => api.renameFolder(...args),
}));

vi.mock('@/shared/api', async () => {
  const actual =
    await vi.importActual<typeof import('@/shared/api')>('@/shared/api');
  return {
    ...actual,
    // 下载走手写层，需要响应头，所以在这里换掉它
    apiFetch: (...args: unknown[]) => fetchMock(...args),
  };
});

const { knowledgeApi } =
  await import('@/features/knowledge-base/api/knowledge-api');

describe('知识库接口层', () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
  });

  it('列表从 databases 字段取出数组', async () => {
    api.listDatabases.mockResolvedValue({
      data: { databases: [{ kb_id: 'kb-1', name: '库' }] },
      error: undefined,
    });

    await expect(knowledgeApi.list()).resolves.toEqual([
      { kb_id: 'kb-1', name: '库' },
    ]);
  });

  it('后端返回缺字段时退化成空数组而不是抛错', async () => {
    api.listDatabases.mockResolvedValue({ data: {}, error: undefined });

    await expect(knowledgeApi.list()).resolves.toEqual([]);
  });

  it('详情默认不带 include_files，需要时才传', async () => {
    api.getDatabase.mockResolvedValue({
      data: { kb_id: 'kb-1' },
      error: undefined,
    });

    await knowledgeApi.get('kb-1');
    expect(api.getDatabase).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1' },
      query: {},
    });

    await knowledgeApi.get('kb-1', { includeFiles: true });
    expect(api.getDatabase).toHaveBeenLastCalledWith({
      path: { kb_id: 'kb-1' },
      query: { include_files: true },
    });
  });

  it('创建失败时把后端 detail 抬成可展示的错误文案', async () => {
    api.createDatabase.mockResolvedValue({
      data: undefined,
      error: { detail: '知识库名称已存在' },
      response: new Response(null, { status: 400 }),
    });

    await expect(
      knowledgeApi.create({
        database_name: '库',
        description: '',
        kb_type: 'milvus',
      }),
    ).rejects.toThrow('知识库名称已存在');
  });

  it('更新按后端必填字段发 name 与 description', async () => {
    api.updateDatabase.mockResolvedValue({ data: {}, error: undefined });

    await knowledgeApi.update('kb-1', { name: '新名字', description: '说明' });

    expect(api.updateDatabase).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1' },
      body: { name: '新名字', description: '说明' },
    });
  });

  it('删除失败时优先用后端的 detail 文案', async () => {
    api.deleteDatabase.mockResolvedValue({
      data: undefined,
      error: { detail: '知识库正在被任务使用' },
      response: new Response(null, { status: 409 }),
    });

    await expect(knowledgeApi.remove('kb-1')).rejects.toThrow(
      '知识库正在被任务使用',
    );
  });

  it('没有后端文案时用中文兜底', async () => {
    api.deleteDatabase.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(knowledgeApi.remove('kb-1')).rejects.toThrow(
      '删除知识库失败。',
    );
  });

  it('文件列表默认取根目录第一页，且不跨目录', async () => {
    api.listDocuments.mockResolvedValue({
      data: { items: [], total: 0, page: 1, page_size: 100, has_more: false },
      error: undefined,
    });

    await knowledgeApi.listDocuments('kb-1');

    expect(api.listDocuments).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1' },
      query: { status: 'all', page: 1, page_size: 100, recursive: false },
    });
  });

  it('筛状态时跨目录，且不再带父目录与前缀（后端递归分支会忽略它们）', async () => {
    api.listDocuments.mockResolvedValue({
      data: { items: [], total: 0, page: 2, page_size: 300, has_more: false },
      error: undefined,
    });

    await knowledgeApi.listDocuments('kb-1', {
      parentId: 'folder-9',
      pathPrefix: 'docs/',
      status: 'parsed',
      page: 2,
      pageSize: 300,
    });

    expect(api.listDocuments).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1' },
      query: {
        status: 'parsed',
        page: 2,
        page_size: 300,
        // 筛状态必须跨目录，否则子目录里的待入库文件筛不出来
        recursive: true,
      },
    });
  });

  it('虚拟目录用路径前缀定位，不发父目录', async () => {
    api.listDocuments.mockResolvedValue({
      data: { items: [], total: 0, page: 1, page_size: 100, has_more: false },
      error: undefined,
    });

    await knowledgeApi.listDocuments('kb-1', { pathPrefix: 'docs/2026/' });

    expect(api.listDocuments).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1' },
      query: {
        path_prefix: 'docs/2026/',
        status: 'all',
        page: 1,
        page_size: 100,
        recursive: false,
      },
    });
  });

  it('文件名搜索只传关键词与条数', async () => {
    api.searchDocuments.mockResolvedValue({
      data: { files: [], total: 0, offset: 0, limit: 100, has_more: false },
      error: undefined,
    });

    await knowledgeApi.searchDocuments('kb-1', { query: '报表' });

    expect(api.searchDocuments).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1' },
      query: { query: '报表', limit: 100 },
    });
  });

  it('类型表与模型列表都从包裹字段里取', async () => {
    api.listTypes.mockResolvedValue({
      data: { kb_types: { milvus: { name: 'ARS' } } },
      error: undefined,
    });
    api.listModels.mockResolvedValue({
      data: {
        data: {
          p1: { provider_id: 'p1', provider_display_name: 'P', models: [] },
        },
      },
      error: undefined,
    });

    await expect(knowledgeApi.listTypes()).resolves.toEqual({
      milvus: { name: 'ARS' },
    });
    await expect(knowledgeApi.listModels()).resolves.toEqual({
      p1: { provider_id: 'p1', provider_display_name: 'P', models: [] },
    });
    expect(api.listModels).toHaveBeenCalledWith({
      query: { model_type: 'embedding' },
    });
  });
});

describe('文件写操作', () => {
  beforeEach(() => {
    api.deleteDocument.mockReset();
    api.batchDeleteDocuments.mockReset();
    api.parseDocuments.mockReset();
    api.indexDocuments.mockReset();
    api.moveDocument.mockReset();
  });

  it('删除单个文件走文件级端点', async () => {
    api.deleteDocument.mockResolvedValue({ data: { message: '删除成功' } });

    await expect(knowledgeApi.deleteDocument('kb-1', 'f-1')).resolves.toEqual({
      message: '删除成功',
    });
    expect(api.deleteDocument).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1', doc_id: 'f-1' },
    });
  });

  it('批量删除把 id 列表直接当请求体，并回传失败明细', async () => {
    api.batchDeleteDocuments.mockResolvedValue({
      data: {
        message: '部分删除成功',
        deleted_count: 2,
        failed_items: [{ doc_id: 'f-3', error: '解析中' }],
      },
    });

    const result = await knowledgeApi.batchDeleteDocuments('kb-1', [
      'f-1',
      'f-2',
      'f-3',
    ]);

    expect(api.batchDeleteDocuments).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1' },
      body: ['f-1', 'f-2', 'f-3'],
    });
    expect(result.deleted_count).toBe(2);
    expect(result.failed_items?.[0]?.doc_id).toBe('f-3');
  });

  it('解析与入库带上文件 id 与参数', async () => {
    api.parseDocuments.mockResolvedValue({
      data: { message: '解析任务已提交', status: 'queued', task_id: 't-1' },
    });
    api.indexDocuments.mockResolvedValue({
      data: { message: '入库任务已提交', status: 'queued', task_id: 't-2' },
    });

    await knowledgeApi.parseDocuments('kb-1', ['f-1'], {
      ocr_engine: 'paddle',
    });
    await knowledgeApi.indexDocuments('kb-1', ['f-2']);

    expect(api.parseDocuments).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1' },
      body: { file_ids: ['f-1'], params: { ocr_engine: 'paddle' } },
    });
    expect(api.indexDocuments).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1' },
      body: { file_ids: ['f-2'], params: {} },
    });
  });

  it('任务没被受理时按后端原因抛错，不静默当成功', async () => {
    // 后端提交异常返回 200 + status: failed
    api.parseDocuments.mockResolvedValue({
      data: { message: '提交失败: 队列不可用', status: 'failed' },
    });

    await expect(knowledgeApi.parseDocuments('kb-1', ['f-1'])).rejects.toThrow(
      '提交失败: 队列不可用',
    );
  });

  it('移动文件提交新父目录，根目录用 null', async () => {
    api.moveDocument.mockResolvedValue({ data: { message: '移动成功' } });

    await knowledgeApi.moveDocument('kb-1', 'f-1', null);

    expect(api.moveDocument).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1', doc_id: 'f-1' },
      body: { new_parent_id: null },
    });
  });

  it('删除失败时抛出后端 detail', async () => {
    api.deleteDocument.mockResolvedValue({
      error: { detail: '删除文档失败: 文件被占用' },
      response: { status: 400 },
    });

    await expect(knowledgeApi.deleteDocument('kb-1', 'f-1')).rejects.toThrow(
      '删除文档失败: 文件被占用',
    );
  });
});

describe('下载文件', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('把响应头里的文件名解析出来（非 ASCII 走 RFC 5987）', async () => {
    fetchMock.mockResolvedValue(
      // 用字符串体：jsdom 的 Blob 不是 undici Response 认的 Blob
      new Response('年报', {
        headers: {
          'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent('年度报表.pdf')}`,
        },
      }),
    );

    const result = await knowledgeApi.downloadDocument('kb-1', 'f-1');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/knowledge/databases/kb-1/documents/f-1/download',
    );
    expect(result.filename).toBe('年度报表.pdf');
    // jsdom 与 undici 的 Blob 不是同一个类，断言内容而不是类型
    expect(await result.blob.text()).toBe('年报');
  });

  it('没有响应头时文件名留空，由界面用行上的名字兜底', async () => {
    fetchMock.mockResolvedValue(new Response('x'));

    const result = await knowledgeApi.downloadDocument('kb-1', 'f-1');

    expect(result.filename).toBeNull();
  });
});

describe('解析内容与预览', () => {
  beforeEach(() => {
    api.fileContent.mockReset();
    fetchMock.mockReset();
  });

  it('分块内容按文档取，缺 lines 时补空数组', async () => {
    api.fileContent.mockResolvedValue({
      data: {
        content: '# 标题',
        lines: [{ id: 'c-1', content: 'x', chunk_order_index: 0 }],
      },
    });

    const result = await knowledgeApi.getFileContent('kb-1', 'f-1');

    expect(api.fileContent).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1', doc_id: 'f-1' },
    });
    expect(result.lines).toHaveLength(1);
    expect(result.content).toBe('# 标题');
  });

  it('内容接口折成 failed 时按失败抛出，不装成空结果', async () => {
    api.fileContent.mockResolvedValue({
      data: { message: 'Failed to get file content', status: 'failed' },
    });

    await expect(knowledgeApi.getFileContent('kb-1', 'f-1')).rejects.toThrow(
      'Failed to get file content',
    );
  });

  it('预览走手写层并按响应归一', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ content: '正文', preview_type: 'text' }), {
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await knowledgeApi.previewFile('kb-1', 'f-1', '报表.md');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/workspace/knowledge/file?kb_id=kb-1&file_id=f-1',
    );
    expect(result).toMatchObject({
      previewType: 'text',
      content: '正文',
      filename: '报表.md',
      supported: true,
    });
  });
});

describe('上传与落库', () => {
  beforeEach(() => {
    api.uploadFile.mockReset();
    api.supportedTypes.mockReset();
    api.ocrOptions.mockReset();
    api.addDocuments.mockReset();
  });

  it('上传带 kb_id，文件名按传入的相对路径改写', async () => {
    api.uploadFile.mockResolvedValue({
      data: {
        file_path: 'http://minio/upload/a.md',
        content_hash: 'hash-a',
        filename: 'docs/a.md',
        size: 12,
      },
    });
    const file = new File(['x'], 'a.md');

    const result = await knowledgeApi.uploadFile('kb-1', file, 'docs/a.md');

    expect(result.content_hash).toBe('hash-a');
    const [options] = api.uploadFile.mock.calls[0] as [
      { query: unknown; body: { file: File } },
    ];
    expect(options.query).toEqual({ kb_id: 'kb-1' });
    // multipart 里的文件名要带上文件夹相对路径，后端据此投影目录
    expect(options.body.file.name).toBe('docs/a.md');
  });

  it('文件名没变时不重建 File', async () => {
    api.uploadFile.mockResolvedValue({
      data: { file_path: 'p', content_hash: 'h', filename: 'a.md' },
    });
    const file = new File(['x'], 'a.md');

    await knowledgeApi.uploadFile('kb-1', file, 'a.md');

    const [options] = api.uploadFile.mock.calls[0] as [
      { body: { file: File } },
    ];
    expect(options.body.file).toBe(file);
  });

  it('支持的后缀与 OCR 引擎选项都能取到', async () => {
    api.supportedTypes.mockResolvedValue({
      data: { file_types: ['.md', '.pdf'] },
    });
    api.ocrOptions.mockResolvedValue({
      data: {
        default_engine: 'rapid_ocr',
        engines: [{ engine_id: 'rapid_ocr', display_name: 'RapidOCR' }],
      },
    });

    expect(await knowledgeApi.listSupportedTypes()).toEqual(['.md', '.pdf']);
    const ocr = await knowledgeApi.listOcrOptions();
    expect(ocr.default_engine).toBe('rapid_ocr');
    expect(ocr.engines[0]?.engine_id).toBe('rapid_ocr');
  });

  it('落库提交 items 与 params，任务未受理时抛后端原因', async () => {
    api.addDocuments.mockResolvedValue({
      data: { message: '任务已提交', status: 'queued', task_id: 't-1' },
    });

    const result = await knowledgeApi.addDocuments(
      'kb-1',
      ['http://minio/upload/a.md'],
      {
        content_type: 'file',
        content_hashes: { 'http://minio/upload/a.md': 'h' },
      },
    );

    expect(api.addDocuments).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1' },
      body: {
        items: ['http://minio/upload/a.md'],
        params: {
          content_type: 'file',
          content_hashes: { 'http://minio/upload/a.md': 'h' },
        },
      },
    });
    expect(result.task_id).toBe('t-1');

    api.addDocuments.mockResolvedValue({
      data: { message: 'Failed to enqueue', status: 'failed' },
    });
    await expect(knowledgeApi.addDocuments('kb-1', ['x'], {})).rejects.toThrow(
      'Failed to enqueue',
    );
  });
});

describe('检索测试与查询参数', () => {
  beforeEach(() => {
    api.queryParams.mockReset();
    api.queryTest.mockReset();
    api.sampleQuestions.mockReset();
  });

  it('取查询参数与示例问题', async () => {
    api.queryParams.mockResolvedValue({
      data: { params: { type: 'milvus', options: [{ key: 'final_top_k' }] } },
    });
    api.sampleQuestions.mockResolvedValue({
      data: { questions: ['这个库讲了什么？'] },
    });

    expect((await knowledgeApi.getQueryParams('kb-1')).options).toHaveLength(1);
    expect(await knowledgeApi.listSampleQuestions('kb-1')).toEqual([
      '这个库讲了什么？',
    ]);
  });

  it('检索测试返回命中分块', async () => {
    api.queryTest.mockResolvedValue({
      data: [{ content: '第一段', score: 0.9, metadata: { file_id: 'f-1' } }],
    });

    const chunks = await knowledgeApi.queryTest('kb-1', '问题', {
      final_top_k: 10,
    });

    expect(api.queryTest).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1' },
      body: { query: '问题', meta: { final_top_k: 10 } },
    });
    expect(chunks[0]?.content).toBe('第一段');
  });

  it('检索失败时把 200 + status:failed 折成异常', async () => {
    api.queryTest.mockResolvedValue({
      data: { message: '测试查询失败: 未配置检索服务', status: 'failed' },
    });

    await expect(knowledgeApi.queryTest('kb-1', '问题', {})).rejects.toThrow(
      '测试查询失败: 未配置检索服务',
    );
  });
});

describe('B1 新增的文件管理接口', () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
    fetchMock.mockReset();
  });

  it('统计修复把请求打到 stats/repair 并带回修复计数', async () => {
    api.repairStats.mockResolvedValue({
      data: {
        stats: { file_count: 3, token_count: 100 },
        updated_chunk_files: 2,
        updated_token_files: 1,
        updated_size_files: 0,
      },
    });

    const result = await knowledgeApi.repairStats('kb-1');

    expect(api.repairStats).toHaveBeenCalledWith({ path: { kb_id: 'kb-1' } });
    expect(result.updated_chunk_files).toBe(2);
    expect(result.updated_token_files).toBe(1);
    expect(result.stats.file_count).toBe(3);
  });

  it('虚拟文件夹检测原样返回 has_virtual_folders', async () => {
    api.detectVirtualFolders.mockResolvedValue({
      data: { has_virtual_folders: true, file_count: 2, remaining_steps: 4 },
    });

    const result = await knowledgeApi.detectVirtualFolders('kb-1');

    expect(api.detectVirtualFolders).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1' },
    });
    expect(result.has_virtual_folders).toBe(true);
    expect(result.remaining_steps).toBe(4);
  });

  it('启动转换任务拿 task_id，进度流按帧回调并在终态收口', async () => {
    api.startVirtualFolderMigration.mockResolvedValue({
      data: { task_id: 'task-9', created: true },
    });

    const snapshots: Array<{ status: string; progress?: number }> = [];
    // 模拟 SSE：三帧（running→running→success），按空行分帧
    const encoder = new TextEncoder();
    fetchMock.mockResolvedValue({
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              'data: {"status":"running","progress":10}\n\ndata: {"status":"running","progress":50}\n\ndata: {"status":"success","progress":100}\n\n',
            ),
          );
          controller.close();
        },
      }),
    });

    const { task_id } = await knowledgeApi.startVirtualFolderMigration('kb-1');
    expect(api.startVirtualFolderMigration).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1' },
    });

    await knowledgeApi.streamVirtualFolderMigration(
      'kb-1',
      task_id,
      (snapshot) => snapshots.push(snapshot),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/knowledge/databases/kb-1/virtual-folders/migrations/task-9/events',
    );
    expect(snapshots.map((s) => s.status)).toEqual([
      'running',
      'running',
      'success',
    ]);
    expect(snapshots[2]?.progress).toBe(100);
  });

  it('待解析与待入库提交带 params 的任务体', async () => {
    api.parsePendingDocuments.mockResolvedValue({ data: { status: 'queued' } });
    api.indexPendingDocuments.mockResolvedValue({ data: { status: 'queued' } });

    await knowledgeApi.parsePendingDocuments('kb-1', { ocr_engine: 'default' });
    await knowledgeApi.indexPendingDocuments('kb-1');

    expect(api.parsePendingDocuments).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1' },
      body: { params: { ocr_engine: 'default' } },
    });
    expect(api.indexPendingDocuments).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1' },
      body: { params: {} },
    });
  });

  it('新建文件夹传名称与父目录，重命名传新名称', async () => {
    api.createFolder.mockResolvedValue({
      data: { file_id: 'folder-1', filename: '资料', is_folder: true },
    });
    api.renameFolder.mockResolvedValue({
      data: { file_id: 'folder-1', filename: '新名字', is_folder: true },
    });

    const folder = await knowledgeApi.createFolder('kb-1', '资料', null);
    expect(api.createFolder).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1' },
      body: { folder_name: '资料', parent_id: null },
    });
    expect(folder.file_id).toBe('folder-1');

    await knowledgeApi.renameFolder('kb-1', 'folder-1', '新名字');
    expect(api.renameFolder).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1', folder_id: 'folder-1' },
      body: { folder_name: '新名字' },
    });
  });
});
