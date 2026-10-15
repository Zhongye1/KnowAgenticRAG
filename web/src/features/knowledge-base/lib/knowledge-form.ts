/**
 * 知识库创建/编辑表单的纯逻辑。
 *
 * 空表单、类型参数的默认值、
 * 提交前校验、请求体拼装。校验是「前端软校验」，后端仍会独立校验。
 */
import type {
  CreateKnowledgeBasePayload,
  KnowledgeTypeInfo,
  KnowledgeTypeParam,
  ShareConfig,
} from '../api/knowledge-api';

/** 分块策略的默认项。 */
export const DEFAULT_CHUNK_PRESET_ID = 'general';

/** 默认共享范围：所有登录用户可读，不额外授予管理。 */
export const createDefaultShareConfig = (): ShareConfig => ({
  version: 2,
  read_scope: { access_level: 'global', department_ids: [], user_uids: [] },
  manage_scope: null,
});

export type KnowledgeBaseForm = {
  name: string;
  description: string;
  embedding_model_spec: string;
  kb_type: string;
  chunk_preset_id: string;
  additional_params: Record<string, unknown>;
};

export const createEmptyKnowledgeBaseForm = (
  embeddingModel = '',
): KnowledgeBaseForm => ({
  name: '',
  description: '',
  embedding_model_spec: embeddingModel,
  kb_type: '',
  chunk_preset_id: DEFAULT_CHUNK_PRESET_ID,
  additional_params: {},
});

/** 类型参数按声明取默认值：显式 default 优先，布尔默认 false，其余空串。 */
export const createParamValues = (
  fields: KnowledgeTypeParam[] = [],
): Record<string, unknown> =>
  Object.fromEntries(
    fields.map((field) => [
      field.key,
      'default' in field
        ? field.default
        : field.type === 'boolean'
          ? false
          : '',
    ]),
  );

/** 切换知识库类型：重置该类型专属参数，已填的名称与描述保留。 */
export const selectKnowledgeBaseType = (
  form: KnowledgeBaseForm,
  kbType: string,
  typeInfo?: KnowledgeTypeInfo,
): KnowledgeBaseForm => ({
  ...form,
  kb_type: kbType,
  additional_params: createParamValues(typeInfo?.create_params?.options),
});

/** 提交前校验；通过返回空串，否则返回可直接展示的文案。 */
export const validateKnowledgeBaseForm = (
  form: KnowledgeBaseForm,
  typeInfo?: KnowledgeTypeInfo,
): string => {
  if (!form.name.trim()) return '请输入知识库名称';
  // 类型为空时 typeInfo 也是 undefined，下面的检查全部会跳过；必须在类型上单独拦一次
  if (!form.kb_type) return '请选择知识库类型';
  if (typeInfo?.requires_embedding_model && !form.embedding_model_spec) {
    return '请选择嵌入模型';
  }

  for (const field of typeInfo?.create_params?.options ?? []) {
    const value = form.additional_params[field.key];
    if (
      field.required &&
      (value === undefined ||
        value === null ||
        (typeof value === 'string' && !value.trim()))
    ) {
      return `请填写${field.label || field.key}`;
    }
    if (field.type === 'number' && typeof value === 'number') {
      if (field.min !== undefined && value < field.min) {
        return `${field.label || field.key}不能小于${field.min}`;
      }
      if (field.max !== undefined && value > field.max) {
        return `${field.label || field.key}不能大于${field.max}`;
      }
    }
  }
  return '';
};

/**
 * 拼创建请求体。
 *
 * `additional_params` 只提交该类型声明过的参数（并去掉首尾空白），
 * 避免把界面上残留的其它类型参数写进后端。
 */
export const buildCreateRequest = (
  form: KnowledgeBaseForm,
  typeInfo: KnowledgeTypeInfo | undefined,
  shareConfig: ShareConfig,
): CreateKnowledgeBasePayload => {
  const additionalParams: Record<string, unknown> = {};
  for (const field of typeInfo?.create_params?.options ?? []) {
    const value = form.additional_params[field.key];
    additionalParams[field.key] =
      typeof value === 'string' ? value.trim() : value;
  }

  const request: CreateKnowledgeBasePayload = {
    database_name: form.name.trim(),
    description: form.description.trim(),
    kb_type: form.kb_type,
    additional_params: additionalParams,
    share_config: shareConfig,
  };
  if (typeInfo?.requires_embedding_model) {
    // 校验已经保证这里非空；界面没有「服务端默认嵌入模型」这一级的来源，不做兜底
    request.embedding_model_spec = form.embedding_model_spec;
    additionalParams.chunk_preset_id =
      form.chunk_preset_id || DEFAULT_CHUNK_PRESET_ID;
  }
  return request;
};
