/**
 * 调试接口层：调用形态（query/path/body）、envelope 解包与切换身份的凭据落盘。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({
  api: {
    logs: vi.fn(),
    config: vi.fn(),
    users: vi.fn(),
    impersonate: vi.fn(),
  },
}));

vi.mock('@/shared/api/generated/sdk.gen', () => ({
  getSystemLogsApiSystemLogsGet: (...args: unknown[]) => api.logs(...args),
  getConfigApiSystemConfigGet: (...args: unknown[]) => api.config(...args),
  readUsersApiAuthUsersGet: (...args: unknown[]) => api.users(...args),
  impersonateUserApiAuthImpersonateUserIdPost: (...args: unknown[]) =>
    api.impersonate(...args),
}));

const { debugApi } = await import('@/features/debug/api/debug-api');
const { TOKEN_STORAGE_KEY } = await import('@/shared/api');

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('取日志', () => {
  it('带级别时作为 levels query，不带级别时不发空参数', async () => {
    api.logs.mockResolvedValue({ data: { log: '一行' }, error: undefined });

    await expect(debugApi.getLogs('INFO,ERROR')).resolves.toBe('一行');
    expect(api.logs).toHaveBeenCalledWith({ query: { levels: 'INFO,ERROR' } });

    await debugApi.getLogs('');
    expect(api.logs).toHaveBeenLastCalledWith({ query: {} });
  });

  it('响应缺 log 字段时算空日志，不是错误', async () => {
    api.logs.mockResolvedValue({
      data: { message: 'success' },
      error: undefined,
    });

    await expect(debugApi.getLogs()).resolves.toBe('');
  });

  it('失败时抛出后端文案', async () => {
    api.logs.mockResolvedValue({
      data: undefined,
      error: { detail: '仅超级管理员可访问' },
      response: { status: 403 },
    });

    await expect(debugApi.getLogs()).rejects.toThrow('仅超级管理员可访问');
  });
});

describe('系统配置', () => {
  it('取配置返回未脱敏对象', async () => {
    api.config.mockResolvedValue({
      data: { RAG_TOP_K: 5, _config_items: {} },
      error: undefined,
    });

    await expect(debugApi.getConfig()).resolves.toEqual({
      RAG_TOP_K: 5,
      _config_items: {},
    });
  });

  it('取配置失败时抛出后端文案', async () => {
    api.config.mockResolvedValue({
      data: undefined,
      error: { detail: '仅超级管理员可访问' },
      response: { status: 403 },
    });

    await expect(debugApi.getConfig()).rejects.toThrow('仅超级管理员可访问');
  });
});

describe('用户列表', () => {
  it('直接返回数组', async () => {
    api.users.mockResolvedValue({
      data: [{ id: 1, uid: 'u-1', username: '甲', role: 'superadmin' }],
      error: undefined,
    });

    await expect(debugApi.listUsers()).resolves.toEqual([
      { id: 1, uid: 'u-1', username: '甲', role: 'superadmin' },
    ]);
    expect(api.users).toHaveBeenCalledWith();
  });
});

describe('切换身份', () => {
  it('成功后把新令牌写进凭据存储', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'old-token');
    api.impersonate.mockResolvedValue({
      data: { access_token: 'new-token' },
      error: undefined,
    });

    await expect(debugApi.impersonate(9)).resolves.toBe('new-token');
    expect(api.impersonate).toHaveBeenCalledWith({ path: { user_id: 9 } });
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('new-token');
  });

  it('后端没给令牌时抛错且不动旧凭据', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'old-token');
    api.impersonate.mockResolvedValue({ data: {}, error: undefined });

    await expect(debugApi.impersonate(9)).rejects.toThrow('后端没有返回令牌');
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('old-token');
  });

  it('接口失败时不落盘', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'old-token');
    api.impersonate.mockResolvedValue({
      data: undefined,
      error: { detail: '目标用户不存在' },
      response: { status: 404 },
    });

    await expect(debugApi.impersonate(9)).rejects.toThrow('目标用户不存在');
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('old-token');
  });
});
