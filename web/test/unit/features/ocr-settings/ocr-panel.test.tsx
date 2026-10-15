import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AntdProvider } from '@/app/theme/antd-provider';

/**
 * OCR 配置分区：渲染真实组件，只把实体层换成桩。
 *
 * 覆盖默认引擎触发钮的文案、四组服务凭据卡的筛选与只读展示（数据库脱敏预览 / 已通过环境变量
 * 配置 / 未配置 / 读取环境变量），以及编辑态保存时把草稿整份交给后端。
 */
const mocks = vi.hoisted(() => ({
  values: {} as Record<string, unknown>,
  items: {} as Record<string, unknown>,
  configLoading: false,
  options: [] as Array<Record<string, unknown>>,
  optionsLoading: false,
  engines: [] as Array<Record<string, unknown>>,
  /** 记录 enabled 实参：引擎清单必须挂载就取，健康检测才允许只在面板打开时取。 */
  engineEnabledCalls: [] as boolean[],
  healthEnabledCalls: [] as boolean[],
  health: {} as Record<string, unknown>,
  healthLoading: false,
  updateConfig: vi.fn(),
  updateOption: vi.fn(),
}));

vi.mock('@/entities/system-config', () => ({
  useSystemConfig: () => ({
    config: { values: mocks.values, items: mocks.items },
    isLoading: mocks.configLoading,
  }),
  useUpdateSystemConfig: () => ({ mutateAsync: mocks.updateConfig }),
  useConfigOptions: () => ({
    options: mocks.options,
    isLoading: mocks.optionsLoading,
  }),
  useUpdateConfigOption: () => ({
    mutateAsync: mocks.updateOption,
    isPending: false,
  }),
  useOcrEngines: (enabled = true) => {
    mocks.engineEnabledCalls.push(enabled);
    return { engines: enabled ? mocks.engines : [], isLoading: false };
  },
  useOcrHealth: (enabled = true) => {
    mocks.healthEnabledCalls.push(enabled);
    return {
      health: mocks.health,
      isLoading: mocks.healthLoading,
    };
  },
}));

const { OcrSettingsPanel } = await import('@/features/ocr-settings');

const option = (overrides: Record<string, unknown>) => ({
  description: '',
  value: {},
  sensitiveState: {},
  ...overrides,
});

const renderPanel = (notifyError = vi.fn()) =>
  render(
    <AntdProvider>
      <OcrSettingsPanel notifySuccess={vi.fn()} notifyError={notifyError} />
    </AntdProvider>,
  );

beforeEach(() => {
  mocks.values = { default_ocr_engine: 'mineru_official' };
  mocks.items = {
    default_ocr_engine: { label: '默认 OCR 解析引擎', type: 'ocr_engine' },
  };
  mocks.configLoading = false;
  mocks.optionsLoading = false;
  mocks.healthLoading = false;
  mocks.health = {};
  mocks.engineEnabledCalls = [];
  mocks.healthEnabledCalls = [];
  mocks.engines = [
    { engineId: 'mineru_official', displayName: 'MinerU Official' },
  ];
  mocks.options = [
    option({
      key: 'mineru_ocr_host_opts',
      name: 'MinerU 服务',
      fields: [
        {
          key: 'server_url',
          label: '服务地址',
          type: 'url',
          environment: 'MINERU_API_URI',
          placeholder: 'http://mineru-api:30001',
          help: '留空时读取 MINERU_API_URI。',
          sensitive: false,
        },
      ],
    }),
    option({
      key: 'mineru_official_api_opts',
      name: 'MinerU Official',
      fields: [
        {
          key: 'api_key',
          label: 'API Key',
          type: 'password',
          environment: 'MINERU_API_KEY',
          sensitive: true,
        },
      ],
      value: { api_key: '' },
      sensitiveState: {
        api_key: {
          source: 'database',
          configured: true,
          preview: 'sk*******89',
        },
      },
    }),
    option({
      key: 'paddleocr_api_opts',
      name: 'PaddleOCR API',
      fields: [
        {
          key: 'api_url',
          label: 'API 地址',
          type: 'url',
          environment: 'PADDLEOCR_API_URL',
          placeholder: 'https://example.com/ocr',
          sensitive: false,
        },
        {
          key: 'api_token',
          label: 'Access Token',
          type: 'password',
          environment: 'PADDLEOCR_API_TOKEN',
          sensitive: true,
        },
      ],
      value: { api_url: 'https://ocr.internal/jobs' },
      sensitiveState: {
        api_token: {
          source: 'environment',
          configured: true,
          preview: null,
        },
      },
    }),
    // 非 OCR 的通用配置项由 Skill 设置消费，本分区不渲染
    option({
      key: 'remote_skill_source_policy',
      name: '远程 Skill 来源',
      fields: [],
    }),
  ];
  mocks.updateConfig.mockReset().mockResolvedValue(undefined);
  mocks.updateOption.mockReset().mockResolvedValue(undefined);
});

/** 卡片标题是 `<h4>`，用它断言渲染了哪几组服务。 */
const cardTitles = (): string[] =>
  screen
    .getAllByRole('heading', { level: 4 })
    .map((heading) => heading.textContent ?? '');

describe('默认 OCR 方法', () => {
  it('标签取后端的 _config_items，触发钮显示当前引擎名', () => {
    renderPanel();

    expect(screen.getByText('默认 OCR 解析引擎')).toBeTruthy();
    const trigger = screen.getByRole('button', { name: '选择 OCR 方法' });
    expect(trigger.textContent).toContain('MinerU Official');
    // 面板没打开也要取引擎清单，否则触发钮会退到占位文案；健康检测相反，只在打开时取
    expect(mocks.engineEnabledCalls).toEqual([true]);
    expect(mocks.healthEnabledCalls).toEqual([false]);
  });
});

describe('OCR 服务配置', () => {
  it('只渲染四组 OCR 凭据，通用配置项不出现', () => {
    renderPanel();

    expect(cardTitles()).toEqual([
      'MinerU 服务',
      'MinerU Official',
      'PaddleOCR API',
    ]);
  });

  it('只读展示按字段类型分流：读环境变量 / 脱敏预览 / 已通过环境变量配置', () => {
    renderPanel();

    expect(screen.getByDisplayValue('读取 MINERU_API_URI')).toBeTruthy();
    expect(screen.getByDisplayValue('sk*******89')).toBeTruthy();
    expect(screen.getByDisplayValue('https://ocr.internal/jobs')).toBeTruthy();
    expect(
      screen.getByDisplayValue('已通过 PADDLEOCR_API_TOKEN 配置'),
    ).toBeTruthy();
  });

  it('未配置的敏感字段显示「未配置」', () => {
    mocks.options = mocks.options.map((entry) =>
      entry.key === 'mineru_official_api_opts'
        ? {
            ...entry,
            sensitiveState: {
              api_key: { source: 'none', configured: false, preview: null },
            },
          }
        : entry,
    );
    renderPanel();

    expect(screen.getByDisplayValue('未配置')).toBeTruthy();
  });

  it('编辑态把草稿整份保存给后端', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getAllByRole('button', { name: '编辑' })[0]);
    const input = await screen.findByLabelText('服务地址');
    await user.type(input, 'http://mineru.internal:30001');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(mocks.updateOption).toHaveBeenCalledWith({
        key: 'mineru_ocr_host_opts',
        value: { server_url: 'http://mineru.internal:30001' },
      }),
    );
  });

  it('同一时刻只允许一张卡在编辑态，取消后回到只读', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getAllByRole('button', { name: '编辑' })[0]);
    expect(screen.getAllByRole('button', { name: '编辑' })).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.getAllByRole('button', { name: '编辑' })).toHaveLength(3);
  });
});
