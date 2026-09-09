import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import {
  buildDocumentPollSignature,
  computeDocumentPollDelay,
  DOCUMENT_POLL_INTERVAL_MS,
  useDocumentPolling,
} from '../use-document-polling'

describe('computeDocumentPollDelay', () => {
  it('从基础间隔 2 倍退避并封顶', () => {
    expect(computeDocumentPollDelay(1)).toBe(10000)
    expect(computeDocumentPollDelay(2)).toBe(20000)
    expect(computeDocumentPollDelay(3)).toBe(30000)
    expect(computeDocumentPollDelay(10)).toBe(30000)
  })
})

describe('buildDocumentPollSignature', () => {
  it('仅统计 parsing/indexing 文档', () => {
    const signature = buildDocumentPollSignature([
      { document_id: 'a', status: 'parsing' },
      { document_id: 'b', status: 'pending' },
      { document_id: 'c', status: 'indexing' },
    ])
    expect(signature).toBe('a:parsing|c:indexing')
    expect(buildDocumentPollSignature([])).toBe('')
  })
})

describe('useDocumentPolling', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  )

  it('持续无变化时按退避轮询并在达到上限后停止', async () => {
    vi.useFakeTimers()
    const poll = vi.fn().mockResolvedValue(undefined)

    const { unmount } = renderHook(
      () => useDocumentPolling({ enabled: true, signature: 'a:parsing', poll }),
      { wrapper },
    )

    await vi.advanceTimersByTimeAsync(DOCUMENT_POLL_INTERVAL_MS)
    await vi.advanceTimersByTimeAsync(10000)
    await vi.advanceTimersByTimeAsync(20000)
    await vi.advanceTimersByTimeAsync(30000)
    await vi.advanceTimersByTimeAsync(30000)
    await vi.advanceTimersByTimeAsync(30000)

    expect(poll).toHaveBeenCalledTimes(6)

    // 已停止：继续推进不再触发
    await vi.advanceTimersByTimeAsync(300000)
    expect(poll).toHaveBeenCalledTimes(6)

    unmount()
    vi.useRealTimers()
  })

  it('签名变化时重置轮询并继续', async () => {
    vi.useFakeTimers()
    const poll = vi.fn().mockResolvedValue(undefined)

    const { rerender, unmount } = renderHook(
      ({ signature }) =>
        useDocumentPolling({
          enabled: true,
          signature,
          poll,
        }),
      { wrapper, initialProps: { signature: 'a:parsing' } },
    )

    await vi.advanceTimersByTimeAsync(DOCUMENT_POLL_INTERVAL_MS)
    expect(poll).toHaveBeenCalledTimes(1)

    rerender({ signature: 'a:ready' })
    await vi.advanceTimersByTimeAsync(DOCUMENT_POLL_INTERVAL_MS)
    expect(poll).toHaveBeenCalledTimes(2)

    unmount()
    vi.useRealTimers()
  })

  it('disabled 时不发起轮询', async () => {
    vi.useFakeTimers()
    const poll = vi.fn().mockResolvedValue(undefined)

    const { unmount } = renderHook(
      () => useDocumentPolling({ enabled: false, poll }),
      { wrapper },
    )

    await vi.advanceTimersByTimeAsync(300000)
    expect(poll).not.toHaveBeenCalled()

    unmount()
    vi.useRealTimers()
  })
})
