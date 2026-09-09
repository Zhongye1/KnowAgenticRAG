import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

/**
 * 文档处理状态轮询（为摄取管线预留）。
 *
 * 摄取接入后，当列表存在 parsing/indexing 文档时开启轮询刷新：
 * - 基础间隔 10s，处理中签名无变化时按 2 倍退避，封顶 30s；
 * - 签名一旦变化（有文档状态推进）立即重置回基础间隔；
 * - 连续 STALE_POLLS_LIMIT 轮无变化自动停止，覆盖僵尸状态。
 *
 * 摄取未接入前（上传恒为 pending，不在签名范围内）不会启动轮询，
 * 列表刷新交给上传/删除等写操作后的 invalidate。
 */

export const DOCUMENT_POLL_INTERVAL_MS = 10000
export const DOCUMENT_POLL_MAX_INTERVAL_MS = 30000
export const DOCUMENT_POLL_STALE_LIMIT = 6

/** 退避计算：第 n 次无变化（n 从 1 起）的等待间隔。 */
export const computeDocumentPollDelay = (staleCount: number): number => {
  if (staleCount <= 1) return DOCUMENT_POLL_INTERVAL_MS
  const exponent = Math.min(staleCount - 1, 6)
  const delay = DOCUMENT_POLL_INTERVAL_MS * 2 ** exponent
  return Math.min(delay, DOCUMENT_POLL_MAX_INTERVAL_MS)
}

type UseDocumentPollingOptions = {
  /** 是否存在处理中（parsing/indexing）文档。 */
  enabled: boolean
  /** 处理中状态签名：任一文档状态变化时轮询应重置退避。 */
  signature?: string
  /** 覆盖默认的刷新实现（测试注入）。 */
  poll?: () => Promise<unknown>
}

export function useDocumentPolling({
  enabled,
  signature = '',
  poll,
}: UseDocumentPollingOptions) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled) return undefined

    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let staleCount = 0
    let expectedSignature = signature

    const refresh = async () => {
      if (poll) {
        await poll()
      } else {
        await queryClient.invalidateQueries({
          queryKey: ['documents'],
          refetchType: 'active',
        })
      }
    }

    const schedule = (delay: number) => {
      timer = setTimeout(() => {
        void (async () => {
          if (disposed) return
          await refresh()
          if (disposed) return

          // 与轮询开始时比对：签名变化说明有进展，重置；否则退避计数。
          const progressed = signature !== expectedSignature
          if (progressed) {
            expectedSignature = signature
            staleCount = 0
            schedule(DOCUMENT_POLL_INTERVAL_MS)
            return
          }

          staleCount += 1
          if (staleCount >= DOCUMENT_POLL_STALE_LIMIT) return
          schedule(computeDocumentPollDelay(staleCount))
        })()
      }, delay)
    }

    schedule(DOCUMENT_POLL_INTERVAL_MS)

    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
    }
  }, [enabled, queryClient, signature, poll])
}

/**
 * 生成轮询签名：仅关注处理中（parsing/indexing）文档的 id+状态。
 * pending 不参与（摄取未接入前 pending 是常态，避免永不收敛的轮询）。
 */
export const buildDocumentPollSignature = (
  items: ReadonlyArray<{ document_id: string; status: string }>,
): string =>
  items
    .filter(
      (item) => item.status === 'parsing' || item.status === 'indexing',
    )
    .map((item) => `${item.document_id}:${item.status}`)
    .join('|')
