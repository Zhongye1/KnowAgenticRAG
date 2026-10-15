/** OCR 配置分区。 */
import * as React from 'react';

import { Button, Input, Spin } from 'antd';

import {
  useConfigOptions,
  useSystemConfig,
  useUpdateConfigOption,
  useUpdateSystemConfig,
  type ConfigOption,
  type ConfigOptionField,
} from '@/entities/system-config';
import { describeFailure } from '@/shared/api';

import { OcrEngineSelector } from './ocr-engine-selector';

import styles from './ocr-settings-panel.module.css';

/** 归到本分区的配置项；其余通用配置项由 Skill 设置消费。 */
const OCR_OPTION_KEYS = new Set([
  'mineru_ocr_host_opts',
  'mineru_official_api_opts',
  'pp_structure_v3_ocr_host_opts',
  'paddleocr_api_opts',
]);

type OcrSettingsPanelProps = {
  notifySuccess: (message: string) => void;
  notifyError: (message: string) => void;
};

export const OcrSettingsPanel = ({
  notifySuccess,
  notifyError,
}: OcrSettingsPanelProps) => {
  const { config, isLoading: configLoading } = useSystemConfig();
  const updateConfig = useUpdateSystemConfig();
  const { options, isLoading: optionsLoading } = useConfigOptions();
  const updateOption = useUpdateConfigOption();

  const [editingKey, setEditingKey] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = React.useState<string | null>(null);

  const ocrOptions = React.useMemo(
    () => options.filter((option) => OCR_OPTION_KEYS.has(option.key)),
    [options],
  );

  const rawEngine = config?.values.default_ocr_engine;
  const defaultEngine = typeof rawEngine === 'string' ? rawEngine : '';
  const engineLabel =
    config?.items.default_ocr_engine?.label || '默认 OCR 方法';

  const startEditing = (option: ConfigOption) => {
    const next: Record<string, string> = {};
    for (const field of option.fields) {
      const value = option.value[field.key];
      next[field.key] = typeof value === 'string' ? value : '';
    }
    setEditingKey(option.key);
    setDraft(next);
  };

  const cancelEditing = () => {
    setEditingKey(null);
    setDraft({});
  };

  const saveOption = async (option: ConfigOption) => {
    setSavingKey(option.key);
    try {
      await updateOption.mutateAsync({ key: option.key, value: draft });
      cancelEditing();
      notifySuccess('配置已保存');
    } catch (failure) {
      notifyError(describeFailure(failure, '保存配置失败'));
    } finally {
      setSavingKey(null);
    }
  };

  const changeEngine = async (engineId: string) => {
    try {
      await updateConfig.mutateAsync({ default_ocr_engine: engineId });
    } catch (failure) {
      notifyError(describeFailure(failure, '保存默认 OCR 方法失败'));
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.sectionTitle}>默认 OCR 方法</div>
      <div className={styles.settingsPanel}>
        <div className={styles.settingLabel}>{engineLabel}</div>
        {configLoading ? (
          <Spin size="small" />
        ) : (
          <OcrEngineSelector
            value={defaultEngine}
            onChange={(engineId) => void changeEngine(engineId)}
          />
        )}
      </div>

      <div className={styles.sectionTitle}>OCR 服务配置</div>
      <p className={styles.sectionDescription}>
        仅展示需要配置的服务。保存空值会清除数据库配置，并读取对应环境变量。
      </p>

      {optionsLoading ? (
        <div className={styles.center}>
          <Spin />
        </div>
      ) : (
        <div className={styles.optionList}>
          {ocrOptions.map((option) => {
            const editing = editingKey === option.key;
            return (
              <section key={option.key} className={styles.optionCard}>
                <header className={styles.optionHeader}>
                  <div>
                    <h4>{option.name}</h4>
                    <p>{option.description}</p>
                  </div>
                  <div
                    className={`${styles.optionActions} ${
                      editing ? styles.optionActionsEditing : ''
                    }`}
                  >
                    {editing ? (
                      <>
                        <Button
                          size="small"
                          disabled={savingKey === option.key}
                          onClick={cancelEditing}
                        >
                          取消
                        </Button>
                        <Button
                          type="primary"
                          size="small"
                          loading={savingKey === option.key}
                          onClick={() => void saveOption(option)}
                        >
                          保存
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="small"
                        disabled={Boolean(editingKey)}
                        onClick={() => startEditing(option)}
                      >
                        编辑
                      </Button>
                    )}
                  </div>
                </header>

                <div
                  className={`${styles.optionFields} ${
                    editing ? '' : styles.optionValues
                  }`}
                >
                  {option.fields.map((field) => (
                    <div key={field.key} className={styles.optionField}>
                      {/* 用 htmlFor 而不是外层 label 包裹：帮助文案留在 small 里，
                          否则它会被算进控件的可访问名 */}
                      <label
                        className={styles.settingLabel}
                        htmlFor={fieldId(option.key, field.key)}
                      >
                        {field.label}
                      </label>
                      {editing ? (
                        field.sensitive ? (
                          <Input.Password
                            id={fieldId(option.key, field.key)}
                            value={draft[field.key] ?? ''}
                            placeholder={field.environment}
                            autoComplete="new-password"
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                [field.key]: event.target.value,
                              }))
                            }
                          />
                        ) : (
                          <Input
                            id={fieldId(option.key, field.key)}
                            allowClear
                            value={draft[field.key] ?? ''}
                            placeholder={field.placeholder || field.environment}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                [field.key]: event.target.value,
                              }))
                            }
                          />
                        )
                      ) : (
                        <Input
                          id={fieldId(option.key, field.key)}
                          disabled
                          value={fieldDisplay(option, field)}
                          className={field.sensitive ? styles.maskedValue : ''}
                        />
                      )}
                      <small>
                        {field.sensitive
                          ? '留空并保存会清除数据库中的值。'
                          : field.help}
                      </small>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};

/** 字段控件的 DOM id：`htmlFor` 用它把标签与控件关联起来。 */
const fieldId = (optionKey: string, fieldKey: string): string =>
  `ocr-${optionKey}-${fieldKey}`;

/** 只读态字段的展示值。 */
const fieldDisplay = (
  option: ConfigOption,
  field: ConfigOptionField,
): string => {
  if (!field.sensitive) {
    const value = option.value[field.key];
    if (typeof value === 'string' && value) return value;

    return `读取 ${field.environment}`;
  }

  const state = option.sensitiveState[field.key];
  if (state?.source === 'database') return state.preview ?? '';
  if (state?.source === 'environment') {
    return `已通过 ${field.environment} 配置`;
  }

  return '未配置';
};
