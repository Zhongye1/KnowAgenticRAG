import { describe, expect, it } from 'vitest';

import type { KnowledgeTypeInfo } from '@/features/knowledge-base';
import {
  DEFAULT_CHUNK_PRESET_ID,
  buildCreateRequest,
  createDefaultShareConfig,
  createEmptyKnowledgeBaseForm,
  createParamValues,
  selectKnowledgeBaseType,
  validateKnowledgeBaseForm,
} from '@/features/knowledge-base';

const milvusType: KnowledgeTypeInfo = {
  name: 'ARS',
  requires_embedding_model: true,
  supports_documents: true,
  create_params: { options: [] },
};

const difyType: KnowledgeTypeInfo = {
  name: 'Dify',
  requires_embedding_model: false,
  supports_documents: false,
  create_params: {
    options: [
      {
        key: 'dify_api_url',
        label: 'Dify API URL',
        type: 'text',
        required: true,
      },
      { key: 'dify_token', label: 'Dify Token', type: 'password', required: true },
      { key: 'timeout', label: '超时', type: 'number', min: 1, max: 60 },
      { key: 'cache', label: '缓存', type: 'boolean', default: true },
    ],
  },
};

describe('表单默认值', () => {
  it('空表单带上默认分块策略与空参数', () => {
    expect(createEmptyKnowledgeBaseForm('bge-m3')).toMatchObject({
      name: '',
      description: '',
      embedding_model_spec: 'bge-m3',
      kb_type: '',
      chunk_preset_id: DEFAULT_CHUNK_PRESET_ID,
      additional_params: {},
    });
  });

  it('类型参数按声明取默认值：显式 default 优先，布尔 false，其余空串', () => {
    expect(
      createParamValues([
        { key: 'a', type: 'text' },
        { key: 'b', type: 'boolean' },
        { key: 'c', type: 'boolean', default: true },
        { key: 'd', type: 'number', default: 5 },
      ]),
    ).toEqual({ a: '', b: false, c: true, d: 5 });
  });

  it('切换类型会重置专属参数，但保留名称与描述', () => {
    const form = {
      ...createEmptyKnowledgeBaseForm('bge'),
      name: '已有名称',
      description: '已有描述',
      additional_params: { 旧参数: 'x' },
    };

    const next = selectKnowledgeBaseType(form, 'dify', difyType);

    expect(next.kb_type).toBe('dify');
    expect(next.name).toBe('已有名称');
    expect(next.description).toBe('已有描述');
    expect(next.additional_params).toEqual({
      dify_api_url: '',
      dify_token: '',
      timeout: '',
      cache: true,
    });
  });
});

describe('提交前校验', () => {
  it('名称为空直接拦下', () => {
    expect(
      validateKnowledgeBaseForm(createEmptyKnowledgeBaseForm(), milvusType),
    ).toBe('请输入知识库名称');
  });

  it('没选类型时先拦类型，不会跳过类型专属检查', () => {
    const form = { ...createEmptyKnowledgeBaseForm(), name: '知识库' };

    // 类型为空时 typeInfo 也是 undefined：如果不单独拦类型，下面所有检查都会被跳过
    expect(validateKnowledgeBaseForm(form, undefined)).toBe('请选择知识库类型');
  });

  it('要求嵌入模型的类型缺模型时拦下', () => {
    const form = {
      ...createEmptyKnowledgeBaseForm(),
      name: '知识库',
      kb_type: 'milvus',
    };

    expect(validateKnowledgeBaseForm(form, milvusType)).toBe('请选择嵌入模型');
  });

  it('必填的类型专属参数缺失时给出字段名', () => {
    const form = {
      ...selectKnowledgeBaseType(
        { ...createEmptyKnowledgeBaseForm(), name: 'Dify 库' },
        'dify',
        difyType,
      ),
    };

    expect(validateKnowledgeBaseForm(form, difyType)).toBe('请填写Dify API URL');
  });

  it('数字超出范围时给出边界', () => {
    const form = {
      ...selectKnowledgeBaseType(
        { ...createEmptyKnowledgeBaseForm(), name: 'Dify 库' },
        'dify',
        difyType,
      ),
      additional_params: {
        dify_api_url: 'https://api.dify.ai/v1',
        dify_token: 'token',
        timeout: 90,
        cache: true,
      },
    };

    expect(validateKnowledgeBaseForm(form, difyType)).toBe('超时不能大于60');
  });

  it('填齐后通过', () => {
    const form = {
      ...createEmptyKnowledgeBaseForm('bge-m3'),
      name: ' 知识库 ',
      kb_type: 'milvus',
    };

    expect(validateKnowledgeBaseForm(form, milvusType)).toBe('');
  });
});

describe('创建请求体', () => {
  it('只提交该类型声明过的参数，并去除首尾空白', () => {
    const form = {
      ...selectKnowledgeBaseType(
        { ...createEmptyKnowledgeBaseForm(), name: ' Dify 库 ', description: ' 说明 ' },
        'dify',
        difyType,
      ),
      additional_params: {
        dify_api_url: ' https://api.dify.ai/v1 ',
        dify_token: ' token ',
        残留参数: '不应出现',
      },
    };

    const request = buildCreateRequest(
      form,
      difyType,
      createDefaultShareConfig(),
    );

    expect(request).toMatchObject({
      database_name: 'Dify 库',
      description: '说明',
      kb_type: 'dify',
      additional_params: {
        dify_api_url: 'https://api.dify.ai/v1',
        dify_token: 'token',
      },
    });
    expect(request.additional_params).not.toHaveProperty('残留参数');
    // 类型不需要嵌入模型时不带该字段
    expect(request).not.toHaveProperty('embedding_model_spec');
  });

  it('要求嵌入模型的类型带上模型与默认分块策略', () => {
    const form = {
      ...createEmptyKnowledgeBaseForm('bge-m3'),
      name: 'ARS 库',
      kb_type: 'milvus',
      chunk_preset_id: '',
    };

    const request = buildCreateRequest(
      form,
      milvusType,
      createDefaultShareConfig(),
    );

    expect(request.embedding_model_spec).toBe('bge-m3');
    // 没选分块策略时用默认项
    expect(request.additional_params?.chunk_preset_id).toBe(
      DEFAULT_CHUNK_PRESET_ID,
    );
  });
});
