/**
 * 模型供应商 api 段的契约用例。
 *
 * 重点两条：1) `to_dict()` 明文返回的 `api_key` 必须在解包时就被折成 `has_api_key`，
 * 对象层面不再有密钥字段（界面回填错误也拿不到原文）；2) 后端「200 + success:false」
 * 与真失败都要折成异常，不能被当成成功。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sdk } = vi.hoisted(() => ({
  sdk: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    remote: vi.fn(),
    status: vi.fn(),
    config: vi.fn(),
  },
}));

vi.mock('@/shared/api/generated/sdk.gen', () => ({
  listProvidersApiSystemModelProvidersGet: (...args: unknown[]) =>
    sdk.list(...args),
  createProviderApiSystemModelProvidersPost: (...args: unknown[]) =>
    sdk.create(...args),
  updateProviderApiSystemModelProvidersProviderIdPut: (...args: unknown[]) =>
    sdk.update(...args),
  deleteProviderApiSystemModelProvidersProviderIdDelete: (...args: unknown[]) =>
    sdk.remove(...args),
  getRemoteModelsApiSystemModelProvidersProviderIdRemoteModelsGet: (
    ...args: unknown[]
  ) => sdk.remote(...args),
  getModelStatusBySpecApiSystemModelProvidersModelsStatusGet: (
    ...args: unknown[]
  ) => sdk.status(...args),
  getConfigApiSystemConfigGet: (...args: unknown[]) => sdk.config(...args),
}));

const { modelProviderApi } =
  await import('@/features/model-providers/api/model-provider-api');

describe('模型供应商 api 段', () => {
  beforeEach(() => {
    sdk.list.mockReset();
    sdk.create.mockReset();
    sdk.update.mockReset();
    sdk.remove.mockReset();
    sdk.remote.mockReset();
    sdk.status.mockReset();
    sdk.config.mockReset();
  });

  it('列表把明文密钥折成 has_api_key，对象里不再有 api_key', async () => {
    sdk.list.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            provider_id: 'p1',
            display_name: '一',
            api_key: 'sk-secret',
            capabilities: [],
            enabled_models: [],
          },
          {
            provider_id: 'p2',
            display_name: '二',
            api_key: null,
            capabilities: [],
            enabled_models: [],
          },
        ],
      },
    });

    const providers = await modelProviderApi.listProviders();
    // 变异：把 api_key 一起放进返回对象时，这两条会失败
    expect('api_key' in providers[0]).toBe(false);
    expect(providers[0].has_api_key).toBe(true);
    expect(providers[1].has_api_key).toBe(false);
  });

  it('创建/更新/删除把请求体与路径原样交给生成客户端', async () => {
    sdk.create.mockResolvedValue({ data: { success: true, data: {} } });
    sdk.update.mockResolvedValue({ data: { success: true, data: {} } });
    sdk.remove.mockResolvedValue({ data: { success: true } });

    await modelProviderApi.createProvider({
      provider_id: 'p1',
      display_name: '一',
    });
    expect(sdk.create).toHaveBeenCalledWith({
      body: { provider_id: 'p1', display_name: '一' },
    });

    await modelProviderApi.updateProvider('p1', { enabled_models: [] });
    expect(sdk.update).toHaveBeenCalledWith({
      path: { provider_id: 'p1' },
      body: { enabled_models: [] },
    });

    await modelProviderApi.deleteProvider('p1');
    expect(sdk.remove).toHaveBeenCalledWith({ path: { provider_id: 'p1' } });
  });

  it('后端返回 success:false 时创建与保存抛错，不静默成功', async () => {
    sdk.create.mockResolvedValue({ data: { success: false } });
    await expect(
      modelProviderApi.createProvider({ provider_id: 'p1' }),
    ).rejects.toThrow('创建供应商失败');

    sdk.update.mockResolvedValue({ data: { success: false } });
    await expect(modelProviderApi.updateProvider('p1', {})).rejects.toThrow(
      '保存供应商失败',
    );
  });

  it('连通性检查：200 + success:false 与正常结果分别处理', async () => {
    sdk.status.mockResolvedValue({
      data: { success: true, data: { spec: 'p1:m1', status: 'available' } },
    });
    await expect(
      modelProviderApi.testModelStatus('p1:m1'),
    ).resolves.toMatchObject({
      status: 'available',
    });

    sdk.status.mockResolvedValue({
      data: {
        success: false,
        data: { spec: 'p1:m1', status: 'error', message: '未找到模型' },
      },
    });
    // 变异：不看 success 就会把失败当成功返回
    await expect(modelProviderApi.testModelStatus('p1:m1')).rejects.toThrow(
      '模型检查失败：p1:m1',
    );
  });

  it('远端模型列表为空时返回空数组', async () => {
    sdk.remote.mockResolvedValue({
      data: { success: true, data: [{ id: 'm1' }] },
    });
    await expect(
      modelProviderApi.fetchRemoteModels('p1'),
    ).resolves.toHaveLength(1);

    sdk.remote.mockResolvedValue({ data: { success: true } });
    await expect(modelProviderApi.fetchRemoteModels('p1')).resolves.toEqual([]);
  });

  it('默认模型 spec 只认字符串，取不到时为空串', async () => {
    sdk.config.mockResolvedValue({ data: { default_model: 'p1:m1' } });
    await expect(modelProviderApi.getDefaultModelSpec()).resolves.toBe('p1:m1');

    sdk.config.mockResolvedValue({ data: { default_model: 42 } });
    await expect(modelProviderApi.getDefaultModelSpec()).resolves.toBe('');

    sdk.config.mockResolvedValue({ data: {} });
    await expect(modelProviderApi.getDefaultModelSpec()).resolves.toBe('');
  });
});
