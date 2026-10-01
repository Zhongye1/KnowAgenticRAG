import { beforeEach, describe, expect, it, vi } from 'vitest';

const discoveryMock = vi.fn();

vi.mock('@/shared/api/generated/sdk.gen', () => ({
  discoveryApiSystemDiscoveryGet: (...args: unknown[]) => discoveryMock(...args),
}));

const { getDiscovery } = await import('@/entities/session');
const { ApiError } = await import('@/shared/api/base');

const payload = {
  name: 'ARS',
  version: '0.7.2b1',
  api_prefix: '/api',
  capabilities: { features: { knowledge: true } },
};

describe('getDiscovery', () => {
  beforeEach(() => {
    discoveryMock.mockReset();
  });

  it('解开发成物的 fields 包装，返回能力投影本体', async () => {
    discoveryMock.mockResolvedValue({ data: payload, error: undefined });

    await expect(getDiscovery()).resolves.toEqual(payload);
  });

  it('LITE 模式下 knowledge 为 false', async () => {
    discoveryMock.mockResolvedValue({
      data: { ...payload, capabilities: { features: { knowledge: false } } },
      error: undefined,
    });

    const discovery = await getDiscovery();

    expect(discovery.capabilities.features.knowledge).toBe(false);
  });

  it('生成物返回 error 时抛出 ApiError，而不是当成成功', async () => {
    discoveryMock.mockResolvedValue({
      data: undefined,
      error: { detail: '服务不可用' },
    });

    await expect(getDiscovery()).rejects.toBeInstanceOf(ApiError);
  });
});
