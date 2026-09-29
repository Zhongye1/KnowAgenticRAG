import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HttpResponse, http } from 'msw'
import { ErrorBoundary } from 'react-error-boundary'
import { MemoryRouter } from 'react-router'

import { MainErrorFallback } from '@/components/errors/main'
import { Notifications } from '@/components/ui/notifications'
import { env } from '@/config/env'
import { server } from '@/testing/mocks/server'
import { fireEvent, render, screen, waitFor } from '@/testing/test-utils'

import { DocumentUploadDialog } from '../documents/document-upload-dialog'

/**
 * 上传失败必须是**可读的提示**，且不能拖垮页面。
 *
 * 后端契约（docs/工程治理/中间件与异常处理.md §6.3）：限额 422 的可读文案（原因 + 建议）
 * 在信封 `msg`，结构化 `{ code, reason, suggestion }` 在 `data`。此前 dev 下 `msg` 是那个
 * 结构化对象，被直接塞进 React 子节点 → "Objects are not valid as a React child"
 * → 整棵组件树被 ErrorBoundary 兜底，页面看起来就是「跳走了」。
 * 前端仍保留对旧形状/异构后端的兼容，故两条形状都锁在用例里。
 */

const UPLOAD_URL = `${env.API_URL}/api/v1/knowledge_bases/:kbName/documents`

const renderDialog = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <ErrorBoundary FallbackComponent={MainErrorFallback}>
      <QueryClientProvider client={queryClient}>
        <Notifications />
        <MemoryRouter>
          <DocumentUploadDialog kbName="kb1" onClose={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>
    </ErrorBoundary>,
  )
}

const pickFile = (name: string) => {
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement
  const file = new File(['%PDF-1.4'], name, { type: 'application/pdf' })
  fireEvent.change(input, { target: { files: [file] } })
}

const REASON = 'PDF 共 250 页，超过上限 200 页'
const SUGGESTION = '请将 PDF 拆分为不超过 200 页的多个文件分别摄取'

test('PDF 超页数（422 限额）时展示原因与建议，页面不崩', async () => {
  server.use(
    http.post(UPLOAD_URL, () =>
      HttpResponse.json(
        {
          // 后端 exception_handler 收口后的形状：msg 是可读文案（原因 + 建议），
          // 结构化 { code, reason, suggestion } 在 data（public 决定 prod 是否放行）
          code: 422,
          msg: `${REASON}（${SUGGESTION}）`,
          data: {
            code: 'pdf_too_many_pages',
            reason: REASON,
            suggestion: SUGGESTION,
            public: true,
          },
          trace_id: 'test-trace',
        },
        { status: 422 },
      ),
    ),
  )

  renderDialog()
  pickFile('大报告.pdf')

  // 列表内联提示 + 右上角通知各一份，都必须是可读文本
  await waitFor(() => {
    expect(screen.getAllByText(/超过上限 200 页/)).toHaveLength(2)
  })
  expect(
    screen.getAllByText(/请将 PDF 拆分为不超过 200 页/).length,
  ).toBeGreaterThan(0)
  expect(screen.queryByText(/Ooops/)).toBeNull()
})

test('旧版结构化 msg（{code, reason, suggestion}）也能读出文案，页面不崩', async () => {
  server.use(
    http.post(UPLOAD_URL, () =>
      HttpResponse.json(
        {
          code: 422,
          msg: {
            code: 'pdf_too_many_pages',
            reason: REASON,
            suggestion: SUGGESTION,
          },
          data: null,
        },
        { status: 422 },
      ),
    ),
  )

  renderDialog()
  pickFile('大报告.pdf')

  await waitFor(() => {
    expect(screen.getAllByText(/超过上限 200 页/)).toHaveLength(2)
  })
  expect(screen.queryByText(/Ooops/)).toBeNull()
})

test('服务端返回 HTML 错误页（404）时退回状态码提示，页面不崩', async () => {
  server.use(
    http.post(UPLOAD_URL, () =>
      HttpResponse.html('<html><body>404 Not Found</body></html>', {
        status: 404,
      }),
    ),
  )

  renderDialog()
  pickFile('大报告.pdf')

  await waitFor(() => {
    expect(screen.getAllByText(/请求的资源不存在/).length).toBeGreaterThan(0)
  })
  expect(screen.queryByText(/Ooops/)).toBeNull()
})
