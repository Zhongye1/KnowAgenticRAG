/**
 * 模型供应商面板的组件用例。
 *
 * 这里不 mock `features/model-providers/api`，而是 mock 契约生成客户端：面板走的是真实的
 * api 段，因此「密钥原文不进 DOM」「留空不下发 api_key」两条安全主张在这里被真正验证，
 * 而不是被替身绕过。
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 20000 });

const { sdk, notifications } = vi.hoisted(() => ({
  sdk: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    remote: vi.fn(),
    status: vi.fn(),
    config: vi.fn(),
  },
  notifications: { addNotification: vi.fn() },
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

vi.mock('@/shared/ui/notifications', () => ({
  useNotifications: () => notifications,
}));

const { ModelProviderPanel } = await import('@/features/model-providers');
const { AntdProvider } = await import('@/app/theme/antd-provider');

/** 后端 `to_dict()` 的投影，含明文密钥——api 段必须把它折成 has_api_key。 */
const rawProvider = (extra: Record<string, unknown> = {}) => ({
  provider_id: 'p1',
  display_name: '供应商一',
  provider_type: 'openai',
  base_url: 'https://api.example.com/v1',
  api_key: 'sk-plain-secret',
  capabilities: ['chat'],
  enabled_models: [
    {
      id: 'm1',
      display_name: '模型一',
      type: 'chat',
      source: 'remote',
      enabled: true,
      context_length: 128000,
    },
  ],
  is_enabled: true,
  is_builtin: false,
  credential_status: 'ok',
  ...extra,
});

const ok = <T,>(data: T) => ({ data: { success: true, data } });

const renderPanel = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <AntdProvider>
      <QueryClientProvider client={queryClient}>
        <ModelProviderPanel />
      </QueryClientProvider>
    </AntdProvider>,
  );
};

describe('模型供应商面板', () => {
  beforeEach(() => {
    notifications.addNotification.mockReset();
    sdk.list.mockReset().mockResolvedValue(ok([rawProvider()]));
    sdk.create.mockReset().mockResolvedValue(ok({}));
    sdk.update.mockReset().mockResolvedValue(ok({}));
    sdk.remove.mockReset().mockResolvedValue(ok({}));
    sdk.remote.mockReset().mockResolvedValue(ok([]));
    sdk.status
      .mockReset()
      .mockResolvedValue(ok({ spec: 'p1:m1', status: 'available' }));
    sdk.config
      .mockReset()
      .mockResolvedValue({ data: { default_model: 'other:m9' } });
  });

  it('按启用状态分组并给出统计，明文密钥不进 DOM', async () => {
    sdk.list.mockResolvedValue(
      ok([
        rawProvider(),
        rawProvider({
          provider_id: 'p2',
          display_name: '供应商二',
          is_enabled: false,
          api_key: null,
        }),
        rawProvider({
          provider_id: 'p3',
          display_name: '供应商三',
          credential_status: 'warning',
        }),
      ]),
    );
    renderPanel();

    expect(await screen.findByText('供应商一')).toBeTruthy();
    expect(screen.getByText('已启用（2）')).toBeTruthy();
    expect(screen.getByText('未启用（1）')).toBeTruthy();
    // 模型计数覆盖全部供应商，含已停用的那份
    expect(screen.getByTestId('provider-stats').textContent).toContain(
      '已启用模型 3 个',
    );
    expect(screen.getByTestId('provider-stats').textContent).toContain(
      '凭证缺失 1 个',
    );
    expect(screen.getByText('凭证缺失')).toBeTruthy();
    // 变异：api 段把 api_key 原样透出时，这条会命中
    expect(document.body.textContent).not.toContain('sk-plain-secret');

    const card = screen.getByText('供应商一').closest('section') as HTMLElement;
    expect(within(card).getByText('https://api.example.com/v1')).toBeTruthy();
    expect(within(card).getByText(/管理模型（已启用 1 个）/)).toBeTruthy();
  });

  it('搜索无匹配时给出空态，不显示任何卡片', async () => {
    renderPanel();
    await screen.findByText('供应商一');

    await userEvent.type(screen.getByLabelText('搜索供应商'), '不存在');
    expect(await screen.findByText('无匹配供应商。')).toBeTruthy();
    expect(screen.queryByText('已启用（1）')).toBeNull();
  });

  it('新增供应商：提交表单时不带空密钥字段', async () => {
    renderPanel();
    await screen.findByText('供应商一');

    await userEvent.click(screen.getByRole('button', { name: '新增供应商' }));
    await userEvent.type(
      await screen.findByLabelText('Provider ID'),
      'new-provider',
    );
    await userEvent.type(screen.getByLabelText('展示名称'), '新供应商');
    await userEvent.type(
      screen.getByLabelText('Base URL'),
      'https://new.example.com/v1',
    );
    await userEvent.click(screen.getByRole('button', { name: '确认' }));

    await waitFor(() => expect(sdk.create).toHaveBeenCalledTimes(1));
    const body = sdk.create.mock.calls[0][0].body;
    expect(body.provider_id).toBe('new-provider');
    expect(body.display_name).toBe('新供应商');
    expect('api_key' in body).toBe(false);
    expect(notifications.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', message: '供应商已创建。' }),
    );
  });

  it('编辑时密钥输入框为空，保存不带 api_key', async () => {
    renderPanel();
    await userEvent.click(
      await screen.findByRole('button', { name: '供应商一' }),
    );

    expect(
      ((await screen.findByLabelText('API Key')) as HTMLInputElement).value,
    ).toBe('');
    expect(screen.getByText('API Key（已配置，留空不改动）')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(sdk.update).toHaveBeenCalledTimes(1));
    const body = sdk.update.mock.calls[0][0].body;
    // 变异：把回填的密钥写回请求体，这里会拿到 sk-plain-secret
    expect('api_key' in body).toBe(false);
  });

  it('停用正在被默认模型使用的供应商会被拦下', async () => {
    sdk.config.mockResolvedValue({ data: { default_model: 'p1:m1' } });
    renderPanel();
    await userEvent.click(
      await screen.findByRole('button', { name: '供应商一' }),
    );

    await userEvent.click(await screen.findByLabelText('启用供应商'));
    await userEvent.click(screen.getByRole('button', { name: '仅保存' }));

    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'warning' }),
      ),
    );
    expect(sdk.update).not.toHaveBeenCalled();
  });

  it('删除正在被默认模型使用的供应商会被拦下', async () => {
    sdk.config.mockResolvedValue({ data: { default_model: 'p1:m1' } });
    renderPanel();
    await userEvent.click(
      await screen.findByRole('button', { name: '供应商一' }),
    );

    await userEvent.click(
      await screen.findByRole('button', { name: '删除供应商' }),
    );

    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'warning',
          message: expect.stringContaining('默认模型'),
        }),
      ),
    );
    expect(sdk.remove).not.toHaveBeenCalled();
  });

  it('删除其他供应商要先确认，确认后才调用接口', async () => {
    renderPanel();
    await userEvent.click(
      await screen.findByRole('button', { name: '供应商一' }),
    );

    await userEvent.click(
      await screen.findByRole('button', { name: '删除供应商' }),
    );
    expect(
      await screen.findByText('删除 供应商一？', {
        selector: '.ant-modal-confirm-title',
      }),
    ).toBeTruthy();
    expect(sdk.remove).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: '删除' }));
    await waitFor(() =>
      expect(sdk.remove).toHaveBeenCalledWith({ path: { provider_id: 'p1' } }),
    );
  });

  it('模型管理：手动添加把模型追加进 enabled_models', async () => {
    renderPanel();
    await userEvent.click(
      await screen.findByRole('button', { name: /管理模型/ }),
    );

    await userEvent.click(
      await screen.findByRole('button', { name: '手动添加' }),
    );
    await userEvent.type(
      await screen.findByLabelText('模型 ID'),
      'local-model',
    );
    await userEvent.click(screen.getByRole('button', { name: '确定' }));

    await waitFor(() => expect(sdk.update).toHaveBeenCalledTimes(1));
    const body = sdk.update.mock.calls[0][0].body;
    expect(body.enabled_models.map((item: { id: string }) => item.id)).toEqual([
      'm1',
      'local-model',
    ]);
    expect(body.enabled_models[1].source).toBe('manual');
  });

  it('移除默认模型会被拦下，移除其他模型要先确认', async () => {
    sdk.config.mockResolvedValue({ data: { default_model: 'p1:m1' } });
    renderPanel();
    await userEvent.click(
      await screen.findByRole('button', { name: /管理模型/ }),
    );

    await userEvent.click(
      await screen.findByRole('button', { name: '移除 模型一' }),
    );
    await userEvent.click(await screen.findByRole('button', { name: '移除' }));
    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'warning' }),
      ),
    );
    expect(sdk.update).not.toHaveBeenCalled();
  });

  it('远端候选可以逐个启用，已启用的不再可点', async () => {
    sdk.remote.mockResolvedValue(
      ok([
        {
          id: 'm1',
          display_name: '模型一',
          type: 'chat',
          context_length: 128000,
        },
        {
          id: 'm2',
          display_name: '模型二',
          type: 'chat',
          pricing: { prompt: '0.000001', completion: '0.000002' },
        },
      ]),
    );
    renderPanel();
    await userEvent.click(
      await screen.findByRole('button', { name: /管理模型/ }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: '获取远程模型' }),
    );

    expect(await screen.findByText('模型二')).toBeTruthy();
    expect(screen.getByText('$1 / $2')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: '模型一 已启用' }),
    ).toHaveProperty('disabled', true);

    await userEvent.click(screen.getByRole('button', { name: '启用 模型二' }));
    await waitFor(() => expect(sdk.update).toHaveBeenCalledTimes(1));
    expect(
      sdk.update.mock.calls[0][0].body.enabled_models.map(
        (item: { id: string }) => item.id,
      ),
    ).toEqual(['m1', 'm2']);
  });

  it('勾选「清除已配置的 API Key」时显式下发 null', async () => {
    renderPanel();
    await userEvent.click(
      await screen.findByRole('button', { name: '供应商一' }),
    );

    await userEvent.click(await screen.findByLabelText(/清除已配置的 API Key/));
    await userEvent.click(screen.getByRole('button', { name: '确认' }));

    await waitFor(() => expect(sdk.update).toHaveBeenCalledTimes(1));
    // 变异：去掉清除分支，这个能力就再也回不来（留空只是「不改动」）
    expect(sdk.update.mock.calls[0][0].body.api_key).toBeNull();
  });

  it('默认模型读不到时删除要二次确认，取消则不发请求', async () => {
    sdk.config.mockRejectedValue(new Error('配置接口不可用'));
    renderPanel();
    await userEvent.click(
      await screen.findByRole('button', { name: '供应商一' }),
    );

    await userEvent.click(
      await screen.findByRole('button', { name: '删除供应商' }),
    );
    expect(
      await screen.findByText(
        '默认模型读取失败，无法确认该供应商是否正在被使用',
        { selector: '.ant-modal-confirm-title' },
      ),
    ).toBeTruthy();
    await userEvent.click(
      within(
        document.querySelector('.ant-modal-confirm') as HTMLElement,
      ).getByRole('button', { name: '取消' }),
    );

    // 变异：fail-open 时这里会直接发出 DELETE——后端没有这条守卫
    await waitFor(() => expect(sdk.remove).not.toHaveBeenCalled());
  });

  it('默认模型读不到时停用也要二次确认，没确认就不保存', async () => {
    sdk.config.mockRejectedValue(new Error('配置接口不可用'));
    renderPanel();
    await userEvent.click(
      await screen.findByRole('button', { name: '供应商一' }),
    );

    await userEvent.click(await screen.findByLabelText('启用供应商'));
    await userEvent.click(screen.getByRole('button', { name: '仅保存' }));
    expect(
      await screen.findByRole('button', { name: '仍然停用' }),
    ).toBeTruthy();
    await userEvent.click(
      within(
        document.querySelector('.ant-modal-confirm') as HTMLElement,
      ).getByRole('button', { name: '取消' }),
    );

    await waitFor(() => expect(sdk.update).not.toHaveBeenCalled());
  });

  it('取消勾选仍有模型在用的能力时当场拦下', async () => {
    renderPanel();
    await userEvent.click(
      await screen.findByRole('button', { name: '供应商一' }),
    );

    await userEvent.click(await screen.findByLabelText('chat'));
    await userEvent.click(screen.getByRole('button', { name: '确认' }));

    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: expect.stringContaining('仍有已启用模型属于 chat'),
        }),
      ),
    );
    // 变异：不拦时会把 capabilities 与 enabled_models 一起提交，后端按一致性校验 400
    expect(sdk.update).not.toHaveBeenCalled();
  });

  it('编辑模型保留表单不编辑的元信息', async () => {
    renderPanel();
    await userEvent.click(
      await screen.findByRole('button', { name: /管理模型/ }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: '配置 模型一' }),
    );

    const nameInput = await screen.findByLabelText('展示名称');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, '模型一改名');
    await userEvent.click(screen.getByRole('button', { name: '确定' }));

    await waitFor(() => expect(sdk.update).toHaveBeenCalledTimes(1));
    const saved = sdk.update.mock.calls[0][0].body.enabled_models[0];
    expect(saved.display_name).toBe('模型一改名');
    // 变异：编辑走整对象替换会把这些字段抹掉，「上下文」列随即变空
    expect(saved.context_length).toBe(128000);
    expect(saved.enabled).toBe(true);
  });

  it('连通性检查返回 error 状态时也按错误级别提示', async () => {
    sdk.status.mockResolvedValue(
      ok({ spec: 'p1:m1', status: 'error', message: '未找到模型: p1:m1' }),
    );
    renderPanel();
    await userEvent.click(
      await screen.findByRole('button', { name: /管理模型/ }),
    );

    await userEvent.click(
      await screen.findByRole('button', { name: '测试模型连接' }),
    );
    // 变异：把 error 并进 warning，这条会拿到 warning
    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: '错误: 未找到模型: p1:m1',
        }),
      ),
    );
  });

  it('连通性检查失败按错误级别提示', async () => {
    sdk.status.mockRejectedValue(new Error('模型连接测试失败'));
    renderPanel();
    await userEvent.click(
      await screen.findByRole('button', { name: /管理模型/ }),
    );

    await userEvent.click(
      await screen.findByRole('button', { name: '测试模型连接' }),
    );
    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', message: '模型连接测试失败' }),
      ),
    );
  });
});
