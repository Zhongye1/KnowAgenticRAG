import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'

import type {
  DocumentItem,
  KnowledgeBase,
} from '@/features/knowledge/api/types'
import {
  resetKnowledgeHandlers,
  seedKnowledgeDocuments,
} from '@/testing/mocks/handlers/knowledge'
import {
  render,
  screen,
  userEvent,
  waitFor,
} from '@/testing/test-utils'

import { KnowledgeDocuments } from '../knowledge-documents'

const createDocument = (
  overrides: Partial<DocumentItem> = {},
): DocumentItem => {
  const base: DocumentItem = {
    document_id: 'doc-1',
    kb_name: 'kb1',
    plugin_namespace: 'core',
    name: '研究计划.pdf',
    source_type: 'file',
    source_uri: 'kb/core/kb1/doc-1/研究计划.pdf',
    pipeline: '',
    status: 'pending',
    sha256: null,
    chunk_count: 0,
    created_time: '2026-09-01T08:00:00Z',
    updated_time: null,
  }
  return { ...base, ...overrides }
}

const kb: KnowledgeBase = {
  kb_name: 'kb1',
  plugin_namespace: 'core',
  display_name: '产品知识库',
  description: '测试',
  theme: 'blue',
  icon: 'book',
  pdf_text_page_ratio: 1,
  embedding_model: '',
  documents: 3,
  created_time: '2026-09-01T08:00:00Z',
}

const renderDocuments = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/knowledge/kg/kb1']}>
        <KnowledgeDocuments kb={kb} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  resetKnowledgeHandlers()
})

test('渲染文档列表、状态与分面', async () => {
  seedKnowledgeDocuments([
    createDocument({ document_id: 'doc-1', status: 'pending' }),
    createDocument({
      document_id: 'doc-2',
      name: '会议纪要.md',
      status: 'ready',
      chunk_count: 12,
    }),
    createDocument({
      document_id: 'doc-3',
      name: '架构图.png',
      source_type: 'image',
      status: 'failed',
    }),
  ])

  renderDocuments()

  expect(await screen.findByText('研究计划.pdf')).toBeInTheDocument()
  expect(screen.getByText('会议纪要.md')).toBeInTheDocument()
  expect(screen.getByText('架构图.png')).toBeInTheDocument()
  // 状态同时出现在表格徽标与分面侧栏
  expect(screen.getAllByText('待处理').length).toBeGreaterThan(0)
  expect(screen.getAllByText('已就绪').length).toBeGreaterThan(0)
  expect(screen.getAllByText('处理失败').length).toBeGreaterThan(0)

  // 分面侧栏：来源类型分组计数（2 个表格行 + 1 个侧栏条目）
  await waitFor(() => {
    expect(screen.getByText('来源类型')).toBeInTheDocument()
  })
  expect(screen.getAllByText('本地文件').length).toBe(3)
})

test('空知识库显示引导空态', async () => {
  seedKnowledgeDocuments([])
  renderDocuments()

  expect(await screen.findByText('还没有文档')).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: /上传第一个文档/i }),
  ).toBeInTheDocument()
})

test('搜索按名称过滤文档', async () => {
  seedKnowledgeDocuments([
    createDocument({ document_id: 'doc-1', name: '产品需求.pdf' }),
    createDocument({ document_id: 'doc-2', name: '周报.txt' }),
  ])

  renderDocuments()
  expect(await screen.findByText('产品需求.pdf')).toBeInTheDocument()

  await userEvent.type(
    screen.getByPlaceholderText('搜索文档名称或 ID'),
    '产品',
  )

  await waitFor(
    () => {
      expect(screen.getByText('产品需求.pdf')).toBeInTheDocument()
      expect(screen.queryByText('周报.txt')).not.toBeInTheDocument()
    },
    { timeout: 2000 },
  )
})

test('点击上传文档打开上传对话框', async () => {
  seedKnowledgeDocuments([createDocument()])
  renderDocuments()

  await userEvent.click(
    await screen.findByRole('button', { name: /上传文档/i }),
  )

  expect(
    await screen.findByText(/点击选择或拖拽文件到此处/i),
  ).toBeInTheDocument()
})
