import { HttpResponse, http } from 'msw';

import type { DocumentItem } from '@/generated/types';
import { env } from '@/config/env';

import { networkDelay } from '../utils';

/**
 * 知识库文档相关 MSW handlers。
 * 文档列表/分面/来源分布由内存数据派生，测试前用 seedDocuments() 播种。
 */

type MockDocument = DocumentItem;

let mockDocuments: MockDocument[] = [];

export const seedKnowledgeDocuments = (items: MockDocument[]) => {
  mockDocuments = [...items];
};

export const resetKnowledgeHandlers = () => {
  mockDocuments = [];
};

const ok = <T>(data: T) => ({ code: 0, msg: 'OK', data });

const pickNumber = (value: string | null, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * 预览描述 mock（D55）：按扩展名给几种代表态，覆盖前端的分支渲染——
 * pdf 走 Range 代理、office 停在 converting（异步转换轮询）、markdown 带续读游标。
 * 判定表只服务于 mock，真实判定权在后端（按扩展名且不信任 Content-Type）。
 */
const buildPreview = (documentId: string, name: string, offset: number) => {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') {
    return {
      document_id: documentId,
      name,
      kind: 'pdf',
      status: 'ready',
      content_url: `/api/v1/documents/${documentId}/preview/content`,
      total_bytes: 1024,
    };
  }
  if (['docx', 'xlsx', 'pptx'].includes(ext)) {
    return { document_id: documentId, name, kind: 'office', status: 'converting' };
  }
  if (['png', 'jpg', 'jpeg'].includes(ext)) {
    return {
      document_id: documentId,
      name,
      kind: 'image',
      status: 'ready',
      url: 'https://example.invalid/preview.png',
    };
  }
  return {
    document_id: documentId,
    name,
    kind: 'markdown',
    status: 'ready',
    content: `# ${name}\n\n窗口 offset=${offset}`,
    offset,
    next_offset: offset === 0 ? 16 : null,
    total_bytes: 32,
  };
};

/** 导出任务的 mock 状态：发起后立即置 success，便于断言「提交 → 拿到下载 URL」这条链路。 */
let mockExports: Record<string, { export_id: string; status: string; document_count: number; size_bytes: number; error: string | null; created_time: string; url: string | null }> = {};

export const resetKnowledgeExports = () => {
  mockExports = {};
};

export const knowledgeExportHandlers = [
  http.post(`${env.API_URL}/api/v1/knowledge_bases/:kbName/export`, async ({ params }) => {
    await networkDelay();
    const exportId = `exp-${Object.keys(mockExports).length + 1}`;
    mockExports[exportId] = {
      export_id: exportId,
      status: 'pending',
      document_count: mockDocuments.length,
      size_bytes: 0,
      error: null,
      created_time: new Date().toISOString(),
      url: null,
    };
    return HttpResponse.json(ok({ export_id: exportId, kb_name: params.kbName, status: 'pending' }));
  }),

  http.get(`${env.API_URL}/api/v1/knowledge_bases/:kbName/exports`, async () => {
    await networkDelay();
    return HttpResponse.json(ok(Object.values(mockExports)));
  }),

  http.get(
    `${env.API_URL}/api/v1/knowledge_bases/:kbName/exports/:exportId`,
    async ({ params }) => {
      await networkDelay();
      const item = mockExports[String(params.exportId)];
      if (!item) {
        return HttpResponse.json({ code: 404, msg: '导出任务不存在', data: null }, { status: 404 });
      }
      // 第一次查询即视为打包完成，让前端能一次轮询到终态
      item.status = 'success';
      item.size_bytes = 2048;
      item.url = 'https://example.invalid/export.zip';
      return HttpResponse.json(ok(item));
    },
  ),
];

export const knowledgeHandlers = [
  http.get(`${env.API_URL}/api/v1/documents`, async ({ request }) => {
    await networkDelay();
    const url = new URL(request.url);
    const kbName = url.searchParams.get('kb_name');
    const query = url.searchParams.get('query');
    const sourceType = url.searchParams.get('source_type');
    const status = url.searchParams.get('status');
    const page = pickNumber(url.searchParams.get('page'), 1);
    const size = pickNumber(url.searchParams.get('size'), 20);

    let items = mockDocuments;
    if (kbName) items = items.filter((doc) => doc.kb_name === kbName);
    if (query) {
      const keyword = query.toLowerCase();
      items = items.filter(
        (doc) =>
          doc.name.toLowerCase().includes(keyword) ||
          doc.document_id.toLowerCase().includes(keyword),
      );
    }
    if (sourceType) items = items.filter((doc) => doc.source_type === sourceType);
    if (status) items = items.filter((doc) => doc.status === status);

    const total = items.length;
    const start = (page - 1) * size;
    const pageItems = items.slice(start, start + size);
    return HttpResponse.json(
      ok({
        items: pageItems,
        total,
        page,
        size,
        total_pages: Math.ceil(total / size),
      }),
    );
  }),

  http.get(
    `${env.API_URL}/api/v1/knowledge_bases/:kbName/facets`,
    async ({ request }) => {
      await networkDelay();
      const url = new URL(request.url);
      const kbName = url.pathname.split('/').at(-2);
      const docs = mockDocuments.filter((doc) => doc.kb_name === kbName);

      const fields: Array<keyof Pick<MockDocument, 'source_type' | 'pipeline' | 'status'>> = [
        'source_type',
        'pipeline',
        'status',
      ];
      const facets = fields.flatMap((field) => {
        const counts = new Map<string, number>();
        for (const doc of docs) {
          const value = doc[field];
          if (!value) continue;
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
        return [...counts.entries()].map(([value, count]) => ({
          field,
          value,
          count,
        }));
      });
      return HttpResponse.json(ok(facets));
    },
  ),

  http.get(
    `${env.API_URL}/api/v1/knowledge_bases/:kbName/format-distribution`,
    async ({ request }) => {
      await networkDelay();
      const url = new URL(request.url);
      const kbName = url.pathname.split('/').at(-2);
      const docs = mockDocuments.filter((doc) => doc.kb_name === kbName);
      const counts = new Map<string, number>();
      for (const doc of docs) {
        const value = doc.source_type || 'unknown';
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
      const distribution = [...counts.entries()].map(([sourceType, count]) => ({
        source_type: sourceType,
        count,
      }));
      return HttpResponse.json(ok(distribution));
    },
  ),

  // 两段式入库：上传只做对象存储 + 登记（POST /knowledge_bases/{kb}/documents）
  http.post(`${env.API_URL}/api/v1/knowledge_bases/:kbName/documents`, async ({ request, params }) => {
    await networkDelay();
    const form = await request.formData();
    const file = form.get('file');
    const kbName = String(params.kbName ?? '');
    const sourceType = String(form.get('source_type') ?? 'file');
    const name =
      file instanceof File ? file.name : 'mock-upload-' + Date.now();

    const doc: MockDocument = {
      document_id: `mock-${Math.random().toString(16).slice(2)}`,
      kb_name: kbName,
      plugin_namespace: 'core',
      name,
      source_type: sourceType,
      source_uri: `kb/core/${kbName}/doc/${name}`,
      pipeline: '',
      status: 'pending',
      sha256: null,
      chunk_count: 0,
      active_version: 1,
      created_time: new Date().toISOString(),
      updated_time: new Date().toISOString(),
    };
    mockDocuments = [doc, ...mockDocuments];
    return HttpResponse.json(ok(doc));
  }),

  http.get(
    `${env.API_URL}/api/v1/documents/:documentId`,
    async ({ params }) => {
      await networkDelay();
      const doc = mockDocuments.find(
        (item) => item.document_id === params.documentId,
      );
      if (!doc) {
        return HttpResponse.json(
          { code: 404, msg: '文档不存在', data: null },
          { status: 404 },
        );
      }
      return HttpResponse.json(ok(doc));
    },
  ),

  http.get(
    `${env.API_URL}/api/v1/documents/:documentId/download`,
    async ({ params }) => {
      await networkDelay();
      const doc = mockDocuments.find(
        (item) => item.document_id === params.documentId,
      );
      if (!doc) {
        return HttpResponse.json(
          { code: 404, msg: '文档不存在', data: null },
          { status: 404 },
        );
      }
      return HttpResponse.json(
        ok({ url: `http://minio.local/${params.documentId}/${doc.name}` }),
      );
    },
  ),

  http.patch(
    `${env.API_URL}/api/v1/documents/:documentId`,
    async ({ params, request }) => {
      await networkDelay();
      const doc = mockDocuments.find(
        (item) => item.document_id === params.documentId,
      );
      if (!doc) {
        return HttpResponse.json(
          { code: 404, msg: '文档不存在', data: null },
          { status: 404 },
        );
      }
      const body = (await request.json()) as Partial<MockDocument>;
      const updated = { ...doc, ...body, updated_time: new Date().toISOString() };
      mockDocuments = mockDocuments.map((item) =>
        item.document_id === updated.document_id ? updated : item,
      );
      return HttpResponse.json(ok(updated));
    },
  ),

  http.put(
    `${env.API_URL}/api/v1/documents/:documentId/file`,
    async ({ params, request }) => {
      await networkDelay();
      const doc = mockDocuments.find(
        (item) => item.document_id === params.documentId,
      );
      if (!doc) {
        return HttpResponse.json(
          { code: 404, msg: '文档不存在', data: null },
          { status: 404 },
        );
      }
      const form = await request.formData();
      const file = form.get('file');
      const updated: MockDocument = {
        ...doc,
        name: file instanceof File ? file.name : doc.name,
        status: 'pending',
        updated_time: new Date().toISOString(),
      };
      mockDocuments = mockDocuments.map((item) =>
        item.document_id === updated.document_id ? updated : item,
      );
      return HttpResponse.json(ok(updated));
    },
  ),

  http.delete(
    `${env.API_URL}/api/v1/documents/:documentId`,
    async ({ params }) => {
      await networkDelay();
      const existed = mockDocuments.some(
        (item) => item.document_id === params.documentId,
      );
      mockDocuments = mockDocuments.filter(
        (item) => item.document_id !== params.documentId,
      );
      if (!existed) {
        return HttpResponse.json(
          { code: 404, msg: '文档不存在', data: null },
          { status: 404 },
        );
      }
      return HttpResponse.json(ok({ deleted: 1 }));
    },
  ),
  // ---- 预览（D55）：描述 + Range 内容 ----
  http.get(
    `${env.API_URL}/api/v1/documents/:documentId/preview`,
    async ({ params, request }) => {
      await networkDelay();
      const doc = mockDocuments.find(
        (item) => item.document_id === params.documentId,
      );
      if (!doc) {
        return HttpResponse.json(
          { code: 404, msg: '文档不存在', data: null },
          { status: 404 },
        );
      }
      const offset = pickNumber(
        new URL(request.url).searchParams.get('offset'),
        0,
      );
      return HttpResponse.json(ok(buildPreview(doc.document_id, doc.name, offset)));
    },
  ),

  // Range 代理：MSW 不便模拟 206 分段，这里只回整体内容，用于断言前端会带鉴权头
  // 去取（206/416 的分段语义由后端单测覆盖）。
  http.get(
    `${env.API_URL}/api/v1/documents/:documentId/preview/content`,
    async () => {
      await networkDelay();
      return new HttpResponse('%PDF-1.7 mock', {
        headers: {
          'Content-Type': 'application/pdf',
          'Accept-Ranges': 'bytes',
        },
      });
    },
  ),
];
