/**
 * 模型供应商面板的纯逻辑用例。
 *
 * 这些判定是界面行为的事实 Owner：分组排序、默认模型保护、写入体折算（密钥留空不下发）、
 * JSON 文本解析、陈旧模型与价格格式化。变异点写在每个用例名里。
 */
import { describe, expect, it } from 'vitest';

import type {
  EnabledModel,
  ModelProvider,
} from '@/features/model-providers/api/model-provider-api';
import {
  buildModelPayload,
  capabilityConflicts,
  buildProviderPayload,
  defaultModelProviderId,
  editingModelTypeOptions,
  emptyProviderForm,
  filterProviders,
  filterRemoteModels,
  formatPriceDisplay,
  formatTokenCount,
  isDefaultModel,
  isModelStale,
  modelStatusText,
  normalizeRemotePrice,
  parseJsonObject,
  providerFormValue,
  providerHasDefaultModel,
  providerStats,
  remoteToEnabledModel,
  remoteTypeCounts,
  splitProviders,
  USD_TO_CNY_RATE,
} from '@/features/model-providers/lib/provider-view';

const provider = (extra: Partial<ModelProvider> = {}): ModelProvider => ({
  provider_id: 'p1',
  display_name: '供应商一',
  provider_type: 'openai',
  base_url: 'https://api.example.com/v1',
  has_api_key: false,
  capabilities: ['chat'],
  enabled_models: [],
  is_enabled: true,
  is_builtin: false,
  credential_status: 'ok',
  ...extra,
});

const model = (extra: Partial<EnabledModel> = {}): EnabledModel => ({
  id: 'm1',
  type: 'chat',
  source: 'remote',
  enabled: true,
  ...extra,
});

describe('供应商分组与排序', () => {
  it('关键字同时匹配 provider_id 与展示名，大小写不敏感', () => {
    const list = [
      provider({ provider_id: 'alpha', display_name: '甲' }),
      provider({ provider_id: 'beta', display_name: '乙供应商' }),
    ];
    expect(
      filterProviders(list, 'ALPHA').map((item) => item.provider_id),
    ).toEqual(['alpha']);
    expect(
      filterProviders(list, '乙供').map((item) => item.provider_id),
    ).toEqual(['beta']);
  });

  it('已启用之间凭证缺失的排在后面，其余按 provider_id 升序', () => {
    const list = [
      provider({ provider_id: 'b', credential_status: 'warning' }),
      provider({ provider_id: 'a', credential_status: 'ok' }),
      provider({ provider_id: 'c', credential_status: 'ok' }),
    ];
    // 变异：去掉 warning 后置这条分支，顺序会变成 a/b/c
    expect(filterProviders(list, '').map((item) => item.provider_id)).toEqual([
      'a',
      'c',
      'b',
    ]);
  });

  it('停用与启用分开，统计包含已启用模型数与凭证缺失数', () => {
    const list = [
      provider({
        provider_id: 'on',
        enabled_models: [model(), model({ id: 'm2' })],
      }),
      provider({ provider_id: 'off', is_enabled: false }),
      provider({ provider_id: 'warn', credential_status: 'warning' }),
    ];
    const groups = splitProviders(filterProviders(list, ''));
    expect(groups.enabled.map((item) => item.provider_id)).toEqual([
      'on',
      'warn',
    ]);
    expect(groups.disabled.map((item) => item.provider_id)).toEqual(['off']);
    expect(providerStats(list)).toEqual({
      total: 3,
      enabled: 2,
      warning: 1,
      models: 2,
    });
  });
});

describe('默认模型保护判定', () => {
  it('spec 前缀即供应商 id，含冒号才算', () => {
    expect(defaultModelProviderId('siliconflow-cn:Pro/MiniMax')).toBe(
      'siliconflow-cn',
    );
    expect(defaultModelProviderId(':x')).toBe('');
    expect(defaultModelProviderId('plain')).toBe('');
  });

  it('供应商保护与模型保护各自判定', () => {
    const spec = 'p1:m1';
    expect(providerHasDefaultModel(spec, 'p1')).toBe(true);
    expect(providerHasDefaultModel(spec, 'p2')).toBe(false);
    expect(isDefaultModel(spec, 'p1', 'm1')).toBe(true);
    expect(isDefaultModel(spec, 'p1', 'm2')).toBe(false);
  });
});

describe('JSON 文本解析', () => {
  it('空文本按空对象处理', () => {
    expect(parseJsonObject('', '请求头')).toEqual({});
    expect(parseJsonObject('   ', '请求头')).toEqual({});
  });

  it('非法 JSON 与数组都抛出带标签的原因', () => {
    expect(() => parseJsonObject('{oops}', '请求头')).toThrow(
      /请求头 格式不正确/,
    );
    expect(() => parseJsonObject('[1]', '扩展配置')).toThrow(
      '扩展配置 必须是 JSON 对象',
    );
    expect(() => parseJsonObject('"text"', '扩展配置')).toThrow(
      '扩展配置 必须是 JSON 对象',
    );
  });
});

describe('写入体折算', () => {
  it('密钥留空时不下发 api_key，填写时才带上', () => {
    const blank = buildProviderPayload({
      ...emptyProviderForm(),
      display_name: 'x',
      base_url: 'u',
    });
    // 变异：把 api_key 写成 form.api_key 会在留空时下发空串，覆盖已配置的密钥
    expect('api_key' in blank).toBe(false);

    const filled = buildProviderPayload({
      ...emptyProviderForm(),
      display_name: 'x',
      base_url: 'u',
      api_key: 'sk-new',
    });
    expect(filled.api_key).toBe('sk-new');
  });

  it('勾选清除密钥时显式下发 api_key: null（留空仍然不带该字段）', () => {
    const cleared = buildProviderPayload({
      ...emptyProviderForm(),
      display_name: 'x',
      base_url: 'u',
      clear_api_key: true,
    });
    // 变异：把清除分支去掉，已配置的密钥就再也删不掉
    expect(cleared.api_key).toBeNull();

    const kept = buildProviderPayload({
      ...emptyProviderForm(),
      display_name: 'x',
      base_url: 'u',
    });
    expect('api_key' in kept).toBe(false);
  });

  it('不下发 default_protocol，可选字段留空写 null', () => {
    const payload = buildProviderPayload({
      ...emptyProviderForm(),
      display_name: 'x',
      base_url: 'u',
      api_key_env: '',
      embedding_base_url: '',
    });
    expect('default_protocol' in payload).toBe(false);
    expect(payload.api_key_env).toBeNull();
    expect(payload.embedding_base_url).toBeNull();
    expect(payload.headers_json).toEqual({});
    expect(payload.extra_json).toEqual({});
  });

  it('请求头与扩展配置按对象解析', () => {
    const payload = buildProviderPayload({
      ...emptyProviderForm(),
      display_name: 'x',
      base_url: 'u',
      headers_text: '{"X-Trace":"1"}',
      extra_text: '{"timeout":30}',
    });
    expect(payload.headers_json).toEqual({ 'X-Trace': '1' });
    expect(payload.extra_json).toEqual({ timeout: 30 });
  });
});

describe('编辑表单取值', () => {
  it('密钥字段始终为空，已配置与否由 has_api_key 表达', () => {
    const form = providerFormValue(provider({ has_api_key: true }));
    // 变异：把 api_key 回填成读到的值，明文密钥会进入 DOM
    expect(form.api_key).toBe('');
  });

  it('JSON 字段格式化为多行文本，能力为空时回退 chat', () => {
    const form = providerFormValue(
      provider({ headers_json: { a: 1 }, capabilities: [] as never }),
    );
    expect(form.headers_text).toBe('{\n  "a": 1\n}');
    expect(form.capabilities).toEqual(['chat']);
  });
});

describe('模型清单', () => {
  it('类型下拉受供应商能力约束，能力为空回退全集', () => {
    expect(editingModelTypeOptions(['embedding'])).toEqual(['embedding']);
    expect(editingModelTypeOptions([])).toEqual([
      'chat',
      'embedding',
      'rerank',
    ]);
  });

  it('组装模型配置：id 去空格，展示名回退 id，请求参数解析', () => {
    const payload = buildModelPayload({
      id: ' BAAI/bge-m3 ',
      display_name: '',
      type: 'embedding',
      source: 'manual',
      protocol_override: '',
      base_url_override: 'https://x/v1',
      request_body_overrides_text: '{"a":1}',
      dimension: 1024,
      batch_size: null,
    });
    expect(payload.id).toBe('BAAI/bge-m3');
    expect(payload.display_name).toBe('BAAI/bge-m3');
    expect(payload.request_body_overrides).toEqual({ a: 1 });
    expect(payload.protocol_override).toBeNull();
    expect(payload.dimension).toBe(1024);
  });

  it('远端模型折成已启用模型时保留 context_length 与 supported_parameters', () => {
    const payload = remoteToEnabledModel({
      id: 'gpt-x',
      display_name: 'GPT X',
      type: 'chat',
      context_length: 128000,
      supported_parameters: ['temperature'],
      pricing: { prompt: '0.1' },
    });
    expect(payload).toMatchObject({
      id: 'gpt-x',
      display_name: 'GPT X',
      source: 'remote',
      enabled: true,
      context_length: 128000,
      supported_parameters: ['temperature'],
    });
    // 价格与模态是展示用富信息，不落库
    expect('pricing' in payload).toBe(false);
  });

  it('编辑模型按原对象合并：保留未编辑字段与 enabled', () => {
    const base = model({
      id: 'm1',
      context_length: 128000,
      supported_parameters: ['temperature'],
      extra: { note: 'keep' },
      enabled: false,
    });
    const payload = buildModelPayload(
      {
        id: 'm1',
        display_name: '改名',
        type: 'chat',
        source: 'remote',
        protocol_override: '',
        base_url_override: '',
        request_body_overrides_text: '{}',
        dimension: null,
        batch_size: null,
      },
      base,
    );
    // 变异：编辑路径不传 base，这些字段会被整对象替换抹掉，enabled 还会被强制成 true
    expect(payload).toMatchObject({
      display_name: '改名',
      context_length: 128000,
      supported_parameters: ['temperature'],
      extra: { note: 'keep' },
      enabled: false,
    });
  });

  it('陈旧判定：手动添加的不判、未拉取远端不判、拉过且不在清单里算陈旧', () => {
    const remote = model({ id: 'gone' });
    // 变异：去掉 source === 'manual' 的短路，手动模型会被误判为已下线
    expect(
      isModelStale(
        model({ source: 'manual', id: 'gone' }),
        'p1',
        { p1: [] },
        { p1: true },
      ),
    ).toBe(false);
    expect(isModelStale(remote, 'p1', { p1: [] }, {})).toBe(false);
    expect(isModelStale(remote, 'p1', { p1: ['other'] }, { p1: true })).toBe(
      true,
    );
    expect(isModelStale(remote, 'p1', { p1: ['gone'] }, { p1: true })).toBe(
      false,
    );
    // 只有明确 enabled 的模型才判陈旧：没有该键的历史/内置模型不算
    const legacy: EnabledModel = {
      id: 'legacy',
      type: 'chat',
      source: 'remote',
    };
    expect(isModelStale(legacy, 'p1', { p1: [] }, { p1: true })).toBe(false);
    expect(
      isModelStale(
        model({ id: 'off', enabled: false }),
        'p1',
        { p1: [] },
        { p1: true },
      ),
    ).toBe(false);
  });

  it('取消能力但仍有同类已启用模型时给出冲突项', () => {
    const models = [
      model({ id: 'chat-1', type: 'chat' }),
      model({ id: 'embed-1', type: 'embedding' }),
    ];
    // 变异：不判冲突会让界面写「chat」而模型清单里还留着 embedding 模型
    expect(capabilityConflicts(['chat'], models)).toEqual(['embedding']);
    expect(capabilityConflicts(['chat', 'embedding'], models)).toEqual([]);
    expect(capabilityConflicts([], models)).toEqual(['chat', 'embedding']);
  });

  it('远端候选按关键字与类型筛选，并给出计数', () => {
    const models = [
      { id: 'a-chat', type: 'chat' as const },
      { id: 'b-embed', type: 'embedding' as const },
      { id: 'c-chat', type: 'chat' as const },
    ];
    expect(
      filterRemoteModels(models, 'chat', 'all').map((item) => item.id),
    ).toEqual(['a-chat', 'c-chat']);
    expect(
      filterRemoteModels(models, '', 'embedding').map((item) => item.id),
    ).toEqual(['b-embed']);
    expect(remoteTypeCounts(models)).toEqual({
      all: 3,
      chat: 2,
      embedding: 1,
      rerank: 0,
    });
  });
});

describe('展示格式化', () => {
  it('token 数量按 M / K 收敛', () => {
    expect(formatTokenCount(1_000_000)).toBe('1M');
    expect(formatTokenCount(1_500_000)).toBe('1.5M');
    expect(formatTokenCount(128_000)).toBe('128K');
    expect(formatTokenCount(999)).toBe('999');
    expect(formatTokenCount(null)).toBe('');
  });

  it('远端价格归一成每百万 token，缺字段返回 null', () => {
    expect(
      normalizeRemotePrice({ prompt: '0.000001', completion: '0.000002' }),
    ).toEqual({
      input: 1,
      output: 2,
    });
    // 变异：把非数值当 0，会让缺价显示成 $0 / $0
    expect(normalizeRemotePrice({ prompt: 'x', completion: '0.1' })).toBeNull();
    expect(normalizeRemotePrice(undefined)).toBeNull();
  });

  it('价格按币种换算展示，人民币用固定汇率', () => {
    const price = { input: 1, output: 2 };
    expect(formatPriceDisplay(price, 'USD')).toBe('$1 / $2');
    expect(formatPriceDisplay(price, 'CNY')).toBe(
      `¥${1 * USD_TO_CNY_RATE} / ¥${2 * USD_TO_CNY_RATE}`,
    );
    expect(formatPriceDisplay(null, 'USD')).toBe('');
  });

  it('连通性结果映射成一句话', () => {
    expect(modelStatusText(undefined)).toBe('测试连接');
    expect(modelStatusText({ spec: 'p:m', status: 'available' })).toBe(
      '可用: 无详细信息',
    );
    expect(
      modelStatusText({ spec: 'p:m', status: 'unavailable', message: '超时' }),
    ).toBe('不可用: 超时');
  });
});
