/** 模型选择字段。 */
import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';

import { useModelCatalog } from '../model/model-catalog-queries';
import type { ModelType } from '../api/model-catalog-api';

import styles from './basic-settings-panel.module.css';

type ModelSelectFieldProps = {
  modelType: ModelType;
  value: string;
  placeholder: string;
  disabled?: boolean;
  onChange: (spec: string) => void;
};

export const ModelSelectField = ({
  modelType,
  value,
  placeholder,
  disabled = false,
  onChange,
}: ModelSelectFieldProps) => {
  const { groups, isLoading } = useModelCatalog(modelType);

  const items: MenuProps['items'] = groups.map((group) => ({
    type: 'group',
    key: group.providerId,
    label: group.providerName,
    children: group.models.map((model) => ({
      key: model.spec,
      label: model.dimension
        ? `${model.label}（${model.dimension}）`
        : model.label,
    })),
  }));

  return (
    <Dropdown
      menu={{
        items,
        selectable: true,
        selectedKeys: value ? [value] : [],
        onClick: ({ key }) => onChange(key),
      }}
      trigger={['click']}
      disabled={disabled}
    >
      <button
        type="button"
        className={styles.modelTrigger}
        title={value || placeholder}
        aria-label="选择模型"
        disabled={disabled}
      >
        <span className={styles.modelTriggerText}>
          {isLoading ? '加载中...' : value || placeholder}
        </span>
        <ChevronDown size={14} aria-hidden />
      </button>
    </Dropdown>
  );
};
