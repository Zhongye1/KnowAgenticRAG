import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';

/**
 * OCR 健康查询的取数时机与加载态。
 *
 * 触发钮用它决定显示转动图标还是箭头，所以「未启用」必须读作未加载：TanStack 的
 * `isPending` 在 `enabled: false` 时同样为 true，用它会让触发钮一直转。
 */
const sdk = vi.hoisted(() => ({
  getOcrHealthApiSystemOcrHealthGet: vi.fn(),
  getOcrEngineOptionsApiSystemOcrOptionsGet: vi.fn(),
  getConfigApiSystemConfigGet: vi.fn(),
  updateConfigBatchApiSystemConfigUpdatePost: vi.fn(),
  getConfigOptionsApiSystemConfigOptionsGet: vi.fn(),
  putConfigOptionApiSystemConfigOptionsKeyPut: vi.fn(),
}));

vi.mock('@/shared/api/generated/sdk.gen', () => sdk);

const { useOcrHealth } = await import('@/entities/system-config');

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  for (const fn of Object.values(sdk)) fn.mockReset();
});

describe('useOcrHealth', () => {
  it('未启用时不读作加载中，也不发请求', async () => {
    const { result } = renderHook(() => useOcrHealth(false), { wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.health).toEqual({});
    expect(sdk.getOcrHealthApiSystemOcrHealthGet).not.toHaveBeenCalled();
  });

  it('启用后请求健康结论，并在拿到后停止加载', async () => {
    sdk.getOcrHealthApiSystemOcrHealthGet.mockResolvedValue({
      data: { health: { mineru_official: { status: 'healthy', message: '' } } },
    });

    const { result } = renderHook(() => useOcrHealth(true), { wrapper });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() =>
      expect(result.current.health.mineru_official?.status).toBe('healthy'),
    );
    expect(result.current.isLoading).toBe(false);
  });
});
