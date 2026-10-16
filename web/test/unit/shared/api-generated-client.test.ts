/**
 * 生成客户端的装配：默认超时与错误折叠。
 *
 * 两者都在 `shared/api/base.ts` 里装配。超时那条抽成 `applyRequestTimeout` 直接断言，因为
 * 经过客户端观察不到差别：`Request.signal` 永远存在，只看它无法区分"挂没挂上默认超时"。
 * 错误折叠那条用真实 SDK 驱动：生成物用 `throwOnError` 抛出的是响应体本身，折成 `ApiError`
 * 之前各调用点的错误文案会集体退化，所以两个方向都要断言。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiClient } from '@/shared/api';
import { applyRequestTimeout } from '@/shared/api/base';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('默认超时的注入', () => {
  it('未显式传 signal 时重建请求并挂上超时', async () => {
    const request = new Request('http://localhost:5050/api/system/health');

    const timed = applyRequestTimeout(request, {}, 20);

    expect(timed).not.toBe(request);
    expect(timed.signal).not.toBe(request.signal);
    await new Promise((resolve) =>
      timed.signal.addEventListener('abort', resolve),
    );
    expect(timed.signal.aborted).toBe(true);
  });

  it('调用点显式传 signal 时原样返回，不加超时', () => {
    const request = new Request('http://localhost:5050/api/system/health');
    const controller = new AbortController();

    const timed = applyRequestTimeout(request, { signal: controller.signal }, 20);

    expect(timed).toBe(request);
    expect(timed.signal).toBe(request.signal);
  });
});

describe('生成路径的失败载荷折叠', () => {
  beforeEach(() => {
    // 浏览器里 baseUrl 是空串（同源相对路径）；Node 的 Request 只接受绝对地址，
    // 因此这里临时给一个绝对地址，只影响 URL 解析。
    apiClient.setConfig({ baseUrl: 'http://localhost:5050' });
  });

  afterEach(() => {
    apiClient.setConfig({ baseUrl: '' });
    vi.unstubAllGlobals();
  });

  it('带业务码的失败载荷折成 ApiError，文案取自后端', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(409, { code: 'run_busy', message: '已有运行中的任务' }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { healthCheckApiSystemHealthGet } = await import(
      '@/shared/api/generated/sdk.gen'
    );

    await expect(
      healthCheckApiSystemHealthGet({ throwOnError: true }),
    ).rejects.toMatchObject({
      status: 409,
      message: '已有运行中的任务',
    });
  });

  it('字符串 detail 原样作为文案', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(404, { detail: '智能体不存在' }));
    vi.stubGlobal('fetch', fetchMock);
    const { healthCheckApiSystemHealthGet } = await import(
      '@/shared/api/generated/sdk.gen'
    );

    const error = await healthCheckApiSystemHealthGet({
      throwOnError: true,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
    expect((error as ApiError).message).toBe('智能体不存在');
  });

  it('超时与取消给出可行动的文案，而不是浏览器英文提示', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(
        // 浏览器在 AbortSignal.timeout 触发时抛的就是这个形态；它不是 Error 子类。
        new DOMException(
          'The operation was aborted due to timeout',
          'TimeoutError',
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { healthCheckApiSystemHealthGet } = await import(
      '@/shared/api/generated/sdk.gen'
    );

    await expect(
      healthCheckApiSystemHealthGet({ throwOnError: true }),
    ).rejects.toMatchObject({
      status: 0,
      message: '请求超时，请重试。',
    });
  });
});
