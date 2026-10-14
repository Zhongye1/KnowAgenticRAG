/**
 * OCR 引擎选择器。
 *
 * 对齐参照 `OCRSelector.vue`：触发钮显示当前引擎名（检测中时换成转动图标），面板按健康结论
 * 把引擎分成可用与不可用两组，不可用的一组折叠在「不可用（N）」下面。引擎清单挂载时就取
 * （触发钮要拿它把 `engine_id` 翻成展示名，参照同样在 `onMounted` 里 `loadOptions`），
 * 健康检测只在面板打开时发起——它要真的去探每个服务，不适合随面板常驻。
 */
import * as React from 'react';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';

import { Popover } from 'antd';

import { useOcrEngines, useOcrHealth } from '@/entities/system-config';

import styles from './ocr-settings-panel.module.css';

type OcrEngineSelectorProps = {
  value: string;
  disabled?: boolean;
  onChange: (engineId: string) => void;
};

/** 视为可用的健康状态；与参照的 `isHealthy` 同集。 */
const HEALTHY_STATUSES = new Set(['healthy', 'configured', 'ok']);

export const OcrEngineSelector = ({
  value,
  disabled = false,
  onChange,
}: OcrEngineSelectorProps) => {
  const [open, setOpen] = React.useState(false);
  const [unavailableExpanded, setUnavailableExpanded] = React.useState(false);

  const { engines, isLoading: enginesLoading } = useOcrEngines();
  const { health, isLoading: healthLoading } = useOcrHealth(open);

  const statusOf = (engineId: string) => health[engineId]?.status ?? '';
  const isHealthy = (engineId: string) =>
    HEALTHY_STATUSES.has(statusOf(engineId));

  const unavailable = engines.filter(
    (engine) => statusOf(engine.engineId) && !isHealthy(engine.engineId),
  );
  const unavailableIds = new Set(unavailable.map((engine) => engine.engineId));
  const active = engines.filter(
    (engine) => !unavailableIds.has(engine.engineId),
  );

  const selectedLabel =
    engines.find((engine) => engine.engineId === value)?.displayName ||
    '请选择 OCR 方法';

  const healthLabel = (engineId: string) => {
    if (healthLoading && !statusOf(engineId)) return '检测中';
    if (!statusOf(engineId)) return '未检测';

    return isHealthy(engineId) ? '可用' : '不可用';
  };

  const healthClass = (engineId: string) => {
    if (healthLoading && !statusOf(engineId)) return styles.healthChecking;
    if (!statusOf(engineId)) return styles.healthUnknown;

    return isHealthy(engineId) ? styles.healthHealthy : styles.healthUnhealthy;
  };

  const content = (
    <div className={styles.dropdown}>
      <div className={styles.dropdownHeader}>OCR 方法</div>
      <div className={styles.dropdownOptions}>
        {enginesLoading ? (
          <div className={styles.dropdownEmpty}>加载中...</div>
        ) : engines.length === 0 ? (
          <div className={styles.dropdownEmpty}>暂无可用 OCR 方法</div>
        ) : (
          <>
            {active.map((engine) => (
              <button
                key={engine.engineId}
                type="button"
                className={`${styles.option} ${
                  value === engine.engineId ? styles.optionSelected : ''
                }`}
                aria-label={engine.displayName}
                onClick={() => {
                  onChange(engine.engineId);
                  setOpen(false);
                }}
              >
                <span className={styles.optionMain}>
                  <span className={styles.optionName}>
                    {engine.displayName}
                  </span>
                  <span
                    className={`${styles.healthLabel} ${healthClass(engine.engineId)}`}
                  >
                    {healthLabel(engine.engineId)}
                  </span>
                </span>
              </button>
            ))}

            {unavailable.length ? (
              <button
                type="button"
                className={styles.unavailableToggle}
                aria-expanded={unavailableExpanded}
                onClick={() => setUnavailableExpanded((current) => !current)}
              >
                <span>不可用（{unavailable.length}）</span>
                {unavailableExpanded ? (
                  <ChevronDown size={13} aria-hidden />
                ) : (
                  <ChevronRight size={13} aria-hidden />
                )}
              </button>
            ) : null}

            {unavailableExpanded
              ? unavailable.map((engine) => (
                  <button
                    key={engine.engineId}
                    type="button"
                    className={`${styles.option} ${styles.optionUnavailable} ${
                      value === engine.engineId ? styles.optionSelected : ''
                    }`}
                    aria-label={`${engine.displayName}（不可用）`}
                    disabled
                  >
                    <span className={styles.optionMain}>
                      <span className={styles.optionName}>
                        {engine.displayName}
                      </span>
                      <span
                        className={`${styles.healthLabel} ${styles.healthUnhealthy}`}
                      >
                        不可用
                      </span>
                    </span>
                    <span className={styles.unavailableReason}>
                      {health[engine.engineId]?.message || '健康检测未通过'}
                    </span>
                  </button>
                ))
              : null}
          </>
        )}
      </div>
    </div>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (disabled) return;
        setOpen(next);
        if (next) setUnavailableExpanded(false);
      }}
      trigger="click"
      placement="bottomLeft"
      content={content}
    >
      <button
        type="button"
        className={styles.selectorTrigger}
        disabled={disabled}
        aria-label="选择 OCR 方法"
        aria-expanded={open}
      >
        <span className={styles.selectorTriggerText}>{selectedLabel}</span>
        {healthLoading ? (
          <RefreshCw size={13} className={styles.spinning} aria-hidden />
        ) : (
          <ChevronDown size={14} aria-hidden />
        )}
      </button>
    </Popover>
  );
};
