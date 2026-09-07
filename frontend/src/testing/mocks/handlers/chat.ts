import { HttpResponse, http } from 'msw';

import { env } from '@/config/env';

import { networkDelay } from '../utils';

/**
 * 知识问答相关 MSW handlers。
 * - GET  /api/v1/knowledge_bases：知识库列表（选择器数据源）
 * - POST /api/v1/knowledge_bases/:kbName/chat：D25 SSE 事件流脚本回放
 *   （meta → citation → delta* → usage → done；提问含"未命中"时走空命中分支）
 */

const ok = <T>(data: T) => ({ code: 0, msg: 'OK', data });

const MOCK_KBS = [
  {
    kb_name: 'platform_docs',
    plugin_namespace: 'core',
    display_name: '平台架构文档库',
    description: '系统设计与架构文档',
    theme: 'blue',
    icon: 'database',
    pdf_text_page_ratio: 0.2,
    embedding_model: 'bge-m3',
    documents: 12,
    text_vectors: 345,
    visual_vectors: 0,
    created_time: '2026-09-01 10:00:00',
    updated_time: null,
  },
  {
    kb_name: 'product_faq',
    plugin_namespace: 'core',
    display_name: '产品 FAQ',
    description: '常见问题与解答',
    theme: 'green',
    icon: 'book',
    pdf_text_page_ratio: 0.2,
    embedding_model: 'bge-m3',
    documents: 34,
    text_vectors: 1024,
    visual_vectors: 0,
    created_time: '2026-09-02 11:00:00',
    updated_time: null,
  },
];

const buildCitations = (kbName: string) => [
  {
    n: 1,
    kb_name: kbName,
    document_id: 'doc-arch-1',
    version_id: 1,
    chunk_id: 'doc-arch-1:1:0',
    source: '平台架构设计.pdf',
    score: 0.91,
    content:
      '系统采用 FastAPI + React 前后端分离架构。检索链路支持 vector 与 hybrid 两种模式，由 retrieval 域统一编排，召回阶段可叠加 reranker 精排。',
  },
  {
    n: 2,
    kb_name: kbName,
    document_id: 'doc-d25-2',
    version_id: 1,
    chunk_id: 'doc-d25-2:1:3',
    source: 'agent-layer-规范.md',
    score: 0.87,
    content:
      '知识库对话以 SSE 事件行协议流式返回（meta / citation / delta / usage / done / error），回答正文以 [n] 标注引用，引用条目稳定到文档版本。',
  },
];

const buildAnswer = (query: string) =>
  [
    `关于「${query}」，知识库中的相关内容如下：`,
    '',
    '- 系统采用 **FastAPI + React** 前后端分离架构，检索链路支持 vector 与 hybrid 两种模式 [1]。',
    '- 知识库对话以 SSE 事件行协议流式返回，引用以 `[n]` 标注并稳定到版本 [2]。',
    '- 每轮查询会重新构建 ACL Scope，并在检索召回内部做权限过滤 [1]。',
  ].join('\n');

const EMPTY_RESULT_TEXT = '知识库中未检索到相关内容，请换个问法或补充资料。';

const chunkText = (text: string, size: number): string[] => {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
};

const sseStream = (
  events: Array<{ event: string; data: unknown; delay?: number }>,
) => {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (index >= events.length) {
        controller.close();
        return;
      }
      const { event, data, delay = 50 } = events[index];
      index += 1;
      await new Promise((resolve) => setTimeout(resolve, delay));
      controller.enqueue(
        encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
      );
    },
  });
};

export const chatHandlers = [
  http.get(`${env.API_URL}/api/v1/knowledge_bases`, async ({ request }) => {
    await networkDelay();
    const url = new URL(request.url);
    const query = url.searchParams.get('query');
    let items = MOCK_KBS;
    if (query) {
      const keyword = query.toLowerCase();
      items = items.filter(
        (kb) =>
          kb.kb_name.includes(keyword) ||
          kb.display_name.toLowerCase().includes(keyword),
      );
    }
    return HttpResponse.json(
      ok({ items, total: items.length, page: 1, size: 200, total_pages: 1 }),
    );
  }),

  http.post(
    `${env.API_URL}/api/v1/knowledge_bases/:kbName/chat`,
    async ({ request, params }) => {
      await networkDelay();
      const kbName = String(params.kbName ?? 'platform_docs');
      const body = (await request.json().catch(() => ({}))) as {
        query_text?: string;
      };
      const query = body.query_text ?? '这个问题';

      if (query.includes('未命中')) {
        return new HttpResponse(
          sseStream([
            { event: 'meta', data: { kb_name: kbName, mode: 'hybrid', model_spec: 'mock:qwen2.5-7b', hit_count: 0 } },
            { event: 'delta', data: { content: EMPTY_RESULT_TEXT }, delay: 200 },
            { event: 'done', data: { reason: 'empty_result' } },
          ]),
          {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
            },
          },
        );
      }

      const citations = buildCitations(kbName);
      const answer = buildAnswer(query);
      const events: Array<{ event: string; data: unknown; delay?: number }> = [
        {
          event: 'meta',
          data: { kb_name: kbName, mode: 'hybrid', model_spec: 'mock:qwen2.5-7b', hit_count: 2 },
          delay: 300,
        },
        { event: 'citation', data: { citations }, delay: 80 },
        ...chunkText(answer, 8).map((content) => ({
          event: 'delta',
          data: { content },
          delay: 60,
        })),
        { event: 'usage', data: { prompt_tokens: 512, completion_tokens: 256, total_tokens: 768 } },
        { event: 'done', data: { reason: 'complete' } },
      ];

      return new HttpResponse(sseStream(events), {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      });
    },
  ),
];
