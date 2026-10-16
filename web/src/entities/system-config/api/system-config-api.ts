/**
 * 系统配置与 OCR 端点（管理员面）。
 *
 * 只走契约生成的 SDK，响应形状复用 `openapi.json` 生成的具名模型；字段仍按不可信数据归一：
 * 只保留形状正确的条目，未知字段不往界面传。
 */
import { unwrap } from '@/shared/api';
import {
  getConfigApiSystemConfigGet,
  getConfigOptionsApiSystemConfigOptionsGet,
  getOcrEngineOptionsApiSystemOcrOptionsGet,
  getOcrHealthApiSystemOcrHealthGet,
  putConfigOptionApiSystemConfigOptionsKeyPut,
  updateConfigBatchApiSystemConfigUpdatePost,
} from '@/shared/api/generated/sdk.gen';
import type {
  ConfigOptionResponse,
  ConfigOptionsResponse,
  OcrHealthResponse,
  OcrOptionsResponse,
  SystemConfigResponse,
} from '@/shared/api/generated/types.gen';

/** 一个配置项的元信息（后端 `_config_items` 的一条）。 */
export type ConfigItemMeta = {
  /** 界面上的标签。 */
  label: string;
  type: string;
};

/** 系统配置：值 + 每项的元信息。 */
export type SystemConfig = {
  values: Record<string, unknown>;
  items: Record<string, ConfigItemMeta>;
};

/** 通用配置项的字段定义（`params.fields` 的一条）。 */
export type ConfigOptionField = {
  key: string;
  label: string;
  type: string;
  /** 留空时回落到这个环境变量。 */
  environment: string;
  placeholder: string;
  help: string;
  sensitive: boolean;
  /** 尚未保存过时后端给出的默认值（列表型字段用它展示有效值）。 */
  defaultValue: unknown;
};

/** 敏感字段的来源与脱敏预览。 */
export type SensitiveState = {
  source: 'database' | 'environment' | 'none' | string;
  configured: boolean;
  preview: string | null;
};

/** 一个通用配置项（如四组 OCR 服务凭据）。 */
export type ConfigOption = {
  key: string;
  name: string;
  description: string;
  fields: ConfigOptionField[];
  value: Record<string, unknown>;
  sensitiveState: Record<string, SensitiveState>;
};

/** 一个可选 OCR 引擎。 */
export type OcrEngine = {
  engineId: string;
  displayName: string;
};

/** 单个引擎的健康检查结论。 */
export type OcrHealth = Record<string, { status: string; message: string }>;

const asText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const normalizeSystemConfig = (raw: unknown): SystemConfig => {
  const source = asRecord(raw);
  const itemsRaw = asRecord(source._config_items);
  const values: Record<string, unknown> = {};
  const items: Record<string, ConfigItemMeta> = {};

  for (const [key, value] of Object.entries(source)) {
    if (key === '_config_items') continue;
    values[key] = value;
  }

  for (const [key, value] of Object.entries(itemsRaw)) {
    const meta = asRecord(value);
    items[key] = {
      label: asText(meta.des) || key,
      type: asText(meta.type) || 'string',
    };
  }

  return { values, items };
};

const normalizeOption = (raw: unknown): ConfigOption | null => {
  const source = asRecord(raw);
  const key = asText(source.key);
  if (!key) return null;

  const params = asRecord(source.params);
  const fields: ConfigOptionField[] = [];
  for (const entry of Array.isArray(params.fields) ? params.fields : []) {
    const field = asRecord(entry);
    const fieldKey = asText(field.key);
    if (!fieldKey) continue;
    fields.push({
      key: fieldKey,
      label: asText(field.label) || fieldKey,
      type: asText(field.type) || 'string',
      environment: asText(field.environment),
      placeholder: asText(field.placeholder),
      help: asText(field.help),
      sensitive: field.sensitive === true,
      defaultValue: field.default,
    });
  }

  const sensitiveState: Record<string, SensitiveState> = {};
  for (const [fieldKey, entry] of Object.entries(
    asRecord(source.sensitive_state),
  )) {
    const state = asRecord(entry);
    sensitiveState[fieldKey] = {
      source: asText(state.source) || 'none',
      configured: state.configured === true,
      preview: typeof state.preview === 'string' ? state.preview : null,
    };
  }

  return {
    key,
    name: asText(source.name) || key,
    description: asText(source.description),
    fields,
    value: asRecord(source.value),
    sensitiveState,
  };
};

/** 读取系统配置（含每项的标签与类型）。 */
export async function getSystemConfig(): Promise<SystemConfig> {
  return normalizeSystemConfig(
    unwrap<SystemConfigResponse>(await getConfigApiSystemConfigGet()),
  );
}

/** 批量写入配置项；响应是写入后的完整配置。 */
export async function updateSystemConfig(
  items: Record<string, unknown>,
): Promise<SystemConfig> {
  return normalizeSystemConfig(
    unwrap<SystemConfigResponse>(
      await updateConfigBatchApiSystemConfigUpdatePost({ body: items }),
    ),
  );
}

/** 通用配置项列表（排除内部的 `system_options`）。 */
export async function listConfigOptions(): Promise<ConfigOption[]> {
  const payload = unwrap<ConfigOptionsResponse>(
    await getConfigOptionsApiSystemConfigOptionsGet(),
  );
  const rows = Array.isArray(payload.options) ? payload.options : [];

  const options: ConfigOption[] = [];
  for (const row of rows) {
    const option = normalizeOption(row);
    if (option) options.push(option);
  }

  return options;
}

/** 保存一个通用配置项的值；响应是保存后的该项。 */
export async function updateConfigOption(
  key: string,
  value: Record<string, unknown>,
): Promise<ConfigOption | null> {
  const payload = unwrap<ConfigOptionResponse>(
    await putConfigOptionApiSystemConfigOptionsKeyPut({
      path: { key },
      body: { value },
    }),
  );

  return normalizeOption(payload.option);
}

/** 代码支持的全部 OCR 引擎。 */
export async function listOcrEngines(): Promise<OcrEngine[]> {
  const payload = unwrap<OcrOptionsResponse>(
    await getOcrEngineOptionsApiSystemOcrOptionsGet(),
  );
  const rows = Array.isArray(payload.engines) ? payload.engines : [];

  const engines: OcrEngine[] = [];
  for (const row of rows) {
    const engine = asRecord(row);
    const engineId = asText(engine.engine_id);
    if (!engineId) continue;
    engines.push({
      engineId,
      displayName: asText(engine.display_name) || engineId,
    });
  }

  return engines;
}

/** 用当前有效配置检查全部 OCR 引擎。 */
export async function getOcrHealth(): Promise<OcrHealth> {
  const payload = unwrap<OcrHealthResponse>(
    await getOcrHealthApiSystemOcrHealthGet(),
  );
  const raw = asRecord(payload.health);
  const health: OcrHealth = {};

  for (const [engineId, entry] of Object.entries(raw)) {
    const state = asRecord(entry);
    health[engineId] = {
      status: asText(state.status),
      message: asText(state.message),
    };
  }

  return health;
}
