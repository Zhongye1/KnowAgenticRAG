import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  getConfigApiSystemConfigGet: vi.fn(),
  updateConfigBatchApiSystemConfigUpdatePost: vi.fn(),
  getConfigOptionsApiSystemConfigOptionsGet: vi.fn(),
  putConfigOptionApiSystemConfigOptionsKeyPut: vi.fn(),
  getOcrEngineOptionsApiSystemOcrOptionsGet: vi.fn(),
  getOcrHealthApiSystemOcrHealthGet: vi.fn(),
}));

vi.mock('@/shared/api/generated/sdk.gen', () => sdk);

const {
  getOcrHealth,
  getSystemConfig,
  listConfigOptions,
  listOcrEngines,
  updateConfigOption,
  updateSystemConfig,
} = await import('@/entities/system-config');

beforeEach(() => {
  for (const fn of Object.values(sdk)) fn.mockReset();
});

describe('getSystemConfig', () => {
  it('把 _config_items 拆出来，值里不再带这个内部字段', async () => {
    sdk.getConfigApiSystemConfigGet.mockResolvedValue({
      data: {
        default_model: 'siliconflow-cn:Pro/MiniMaxAI/MiniMax-M2.5',
        enable_content_guard: false,
        _config_items: {
          default_model: {
            des: '默认对话模型',
            default: 'x',
            type: 'model',
            exclude: false,
          },
        },
      },
    });

    const config = await getSystemConfig();

    expect(config.values).toEqual({
      default_model: 'siliconflow-cn:Pro/MiniMaxAI/MiniMax-M2.5',
      enable_content_guard: false,
    });
    expect(config.items.default_model).toEqual({
      label: '默认对话模型',
      type: 'model',
    });
  });

  it('元信息缺 des 时退到 key，缺 type 时退到 string', async () => {
    sdk.getConfigApiSystemConfigGet.mockResolvedValue({
      data: { _config_items: { reranker: {} } },
    });

    const config = await getSystemConfig();

    expect(config.items.reranker).toEqual({
      label: 'reranker',
      type: 'string',
    });
  });
});

describe('updateSystemConfig', () => {
  it('单键也走批量接口，响应回写成新的配置', async () => {
    sdk.updateConfigBatchApiSystemConfigUpdatePost.mockResolvedValue({
      data: {
        default_ocr_engine: 'mineru_official',
        _config_items: {
          default_ocr_engine: { des: '默认 OCR 解析引擎', type: 'ocr_engine' },
        },
      },
    });

    const config = await updateSystemConfig({
      default_ocr_engine: 'mineru_official',
    });

    expect(sdk.updateConfigBatchApiSystemConfigUpdatePost).toHaveBeenCalledWith(
      {
        body: { default_ocr_engine: 'mineru_official' },
      },
    );
    expect(config.values.default_ocr_engine).toBe('mineru_official');
  });
});

describe('listConfigOptions', () => {
  it('保留字段定义与敏感来源；缺 key 的项丢掉', async () => {
    sdk.getConfigOptionsApiSystemConfigOptionsGet.mockResolvedValue({
      data: {
        options: [
          {
            key: 'mineru_official_api_opts',
            name: 'MinerU Official',
            description: '配置 MinerU 官方云服务凭证。',
            params: {
              fields: [
                {
                  key: 'api_key',
                  label: 'API Key',
                  type: 'password',
                  environment: 'MINERU_API_KEY',
                  sensitive: true,
                  help: '留空时读取 MINERU_API_KEY',
                },
              ],
            },
            value: { api_key: '' },
            sensitive_state: {
              api_key: {
                source: 'database',
                configured: true,
                preview: 'sk*******89',
              },
            },
          },
          { name: '缺 key 的项' },
        ],
      },
    });

    const options = await listConfigOptions();

    expect(options).toHaveLength(1);
    expect(options[0].key).toBe('mineru_official_api_opts');
    expect(options[0].fields[0]).toEqual({
      key: 'api_key',
      label: 'API Key',
      type: 'password',
      environment: 'MINERU_API_KEY',
      placeholder: '',
      help: '留空时读取 MINERU_API_KEY',
      sensitive: true,
      defaultValue: undefined,
    });
    expect(options[0].sensitiveState.api_key).toEqual({
      source: 'database',
      configured: true,
      preview: 'sk*******89',
    });
  });

  it('列表型字段带回后端默认值，供界面展示有效值', async () => {
    sdk.getConfigOptionsApiSystemConfigOptionsGet.mockResolvedValue({
      data: {
        options: [
          {
            key: 'remote_skill_source_policy',
            name: '远程 Skill 来源',
            params: {
              fields: [
                {
                  key: 'allowed_hosts',
                  label: '允许的来源域名',
                  type: 'list[str]',
                  default: ['github.com', 'modelscope.cn'],
                },
              ],
            },
            value: {},
          },
        ],
      },
    });

    const options = await listConfigOptions();

    expect(options[0].fields[0].defaultValue).toEqual([
      'github.com',
      'modelscope.cn',
    ]);
  });
});

describe('updateConfigOption', () => {
  it('返回保存后的那一项', async () => {
    sdk.putConfigOptionApiSystemConfigOptionsKeyPut.mockResolvedValue({
      data: {
        option: {
          key: 'remote_skill_source_policy',
          name: '远程 Skill 来源',
          params: { fields: [{ key: 'allowed_hosts', type: 'list[str]' }] },
          value: { allowed_hosts: [] },
        },
      },
    });

    const saved = await updateConfigOption('remote_skill_source_policy', {
      allowed_hosts: [],
    });

    expect(
      sdk.putConfigOptionApiSystemConfigOptionsKeyPut,
    ).toHaveBeenCalledWith({
      path: { key: 'remote_skill_source_policy' },
      body: { value: { allowed_hosts: [] } },
    });
    expect(saved?.value.allowed_hosts).toEqual([]);
  });
});

describe('listOcrEngines', () => {
  it('缺 engine_id 的项丢掉，缺 display_name 退到 id', async () => {
    sdk.getOcrEngineOptionsApiSystemOcrOptionsGet.mockResolvedValue({
      data: {
        default_engine: 'mineru_official',
        engines: [
          { engine_id: 'mineru_official', display_name: 'MinerU Official' },
          { engine_id: 'pp_structure_v3' },
          { display_name: '没有 id' },
        ],
      },
    });

    await expect(listOcrEngines()).resolves.toEqual([
      { engineId: 'mineru_official', displayName: 'MinerU Official' },
      { engineId: 'pp_structure_v3', displayName: 'pp_structure_v3' },
    ]);
  });
});

describe('getOcrHealth', () => {
  it('只保留状态与说明', async () => {
    sdk.getOcrHealthApiSystemOcrHealthGet.mockResolvedValue({
      data: {
        health: {
          mineru_official: {
            status: 'healthy',
            message: '',
            details: { latency: 12 },
          },
          paddlex: { status: 'error', message: '连接超时' },
        },
      },
    });

    await expect(getOcrHealth()).resolves.toEqual({
      mineru_official: { status: 'healthy', message: '' },
      paddlex: { status: 'error', message: '连接超时' },
    });
  });
});
