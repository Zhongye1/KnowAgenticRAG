/**
 * 系统配置与 OCR 切片的对外接口。基本设置与 OCR 配置两个分区都从这里引用。
 */
export {
  getOcrHealth,
  getSystemConfig,
  listConfigOptions,
  listOcrEngines,
  updateConfigOption,
  updateSystemConfig,
} from './api/system-config-api';
export type {
  ConfigItemMeta,
  ConfigOption,
  ConfigOptionField,
  OcrEngine,
  OcrHealth,
  SensitiveState,
  SystemConfig,
} from './api/system-config-api';
export {
  CONFIG_OPTIONS_QUERY_KEY,
  OCR_ENGINES_QUERY_KEY,
  OCR_HEALTH_QUERY_KEY,
  SYSTEM_CONFIG_QUERY_KEY,
  useConfigOptions,
  useOcrEngines,
  useOcrHealth,
  useSystemConfig,
  useUpdateConfigOption,
  useUpdateSystemConfig,
} from './model/system-config-queries';
