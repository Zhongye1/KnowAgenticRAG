import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ApiError,
  TOKEN_STORAGE_KEY,
  UNAUTHORIZED_EVENT,
  apiClient,
  apiFetch,
  getAccessToken,
  setAccessToken,
} from '@/shared/api';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('凭据存储', () => {
  beforeEach(() => window.localStorage.clear());

  it('写入后可读回，清除后为空', () => {
    expect(getAccessToken()).toBeNull();
    setAccessToken('ars.token.value');
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe(
      'ars.token.value',
    );
    setAccessToken(null);
    expect(getAccessToken()).toBeNull();
  });
});

describe('apiFetch', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('有凭据时注入 Authorization 头', async () => {
    setAccessToken('ars.token.value');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/system/health');

    const headers = new Headers(
      (fetchMock.mock.calls[0][1] as RequestInit).headers,
    );
    expect(headers.get('Authorization')).toBe('Bearer ars.token.value');
  });

  it('无凭据时不注入 Authorization 头', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/system/health');

    const headers = new Headers(
      (fetchMock.mock.calls[0][1] as RequestInit).headers,
    );
    expect(headers.get('Authorization')).toBeNull();
  });

  it('401 时清除凭据并派发未授权事件', async () => {
    setAccessToken('ars.token.stale');
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(401, { detail: '无效的凭证' })),
    );

    await expect(apiFetch('/api/auth/me')).rejects.toBeInstanceOf(ApiError);

    expect(getAccessToken()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
  });

  it('非 2xx 抛出携带 detail 与状态码的 ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(423, { detail: '登录被锁定' })),
    );

    await expect(apiFetch('/api/auth/token')).rejects.toMatchObject({
      status: 423,
      detail: '登录被锁定',
    });
  });

  it('成功响应按原样返回，不做信封解包', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { status: 'ok' })),
    );

    const response = await apiFetch('/api/system/health');

    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });
});

describe('生成物客户端的凭据与 401 副作用', () => {
  const requestOf = (fetchMock: ReturnType<typeof vi.fn>): Request =>
    fetchMock.mock.calls[0][0] as Request;

  beforeEach(() => {
    window.localStorage.clear();
    // jsdom 的 Request 不接受相对 URL，测试里给客户端一个绝对 baseUrl
    apiClient.setConfig({ baseUrl: 'http://localhost' });
  });

  afterEach(() => {
    apiClient.setConfig({ baseUrl: '' });
    vi.unstubAllGlobals();
  });

  it('未认证入口不携带旧凭据', async () => {
    setAccessToken('ars.token.stale');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { access_token: 'new' }));
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.post({
      url: '/api/auth/token',
      body: { username: 'zwj', password: 'pw' },
    });

    expect(requestOf(fetchMock).headers.get('Authorization')).toBeNull();
  });

  it('其余请求注入 Bearer', async () => {
    setAccessToken('ars.token.stale');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.get({ url: '/api/auth/me' });

    expect(requestOf(fetchMock).headers.get('Authorization')).toBe(
      'Bearer ars.token.stale',
    );
  });

  it('未认证入口的 401 不清凭据，也不派发未授权事件', async () => {
    setAccessToken('ars.token.stale');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse(401, { detail: '登录标识或密码错误' })),
    );
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);

    await apiClient.post({ url: '/api/auth/token', body: {} });

    expect(getAccessToken()).toBe('ars.token.stale');
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
  });

  it('带凭据请求的 401 清凭据并派发未授权事件', async () => {
    setAccessToken('ars.token.stale');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(401, { detail: '无效的凭证' })),
    );
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);

    await apiClient.get({ url: '/api/auth/me' });

    expect(getAccessToken()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
  });
});

describe('ApiError 文案', () => {
  it('字符串 detail 直接作为消息', () => {
    expect(new ApiError(403, '无权访问').message).toBe('无权访问');
  });

  it('结构化 detail 取 message，保留业务语义', () => {
    const error = new ApiError(409, {
      code: 'request_already_dispatched',
      message: '请求已派发，请通过 run 取消接口取消正在进行的运行',
    });

    expect(error.message).toBe(
      '请求已派发，请通过 run 取消接口取消正在进行的运行',
    );
    expect(error.status).toBe(409);
  });

  it('嵌套 detail 字符串同样取用，覆盖 FastAPI 校验错误外层包装', () => {
    expect(new ApiError(422, { detail: '字段缺失' }).message).toBe('字段缺失');
  });

  it('客户端超时给出可行动的文案', () => {
    const timeout = new Error('signal timed out');
    timeout.name = 'TimeoutError';

    expect(new ApiError(0, timeout).message).toBe('请求超时，请重试。');
  });

  it('没有可读文案时退回状态码文案，不把对象塞进 message', () => {
    expect(new ApiError(500, { code: 'boom' }).message).toBe(
      '请求失败（HTTP 500）',
    );
    expect(new ApiError(0, null).message).toBe('请求失败（HTTP 0）');
  });
});
