/**
 * 供应商卡片。
 *
 * 启用的卡显示 Base URL、能力行、凭证缺失徽标与「管理模型」入口；停用态只显示名称与 id。
 * 图标按 `provider_id` 取品牌 logo（`provider-icon.tsx`），自定义供应商回落 Globe。
 */
import { Settings2 } from 'lucide-react';

import type { ModelProvider } from '../api/model-provider-api';
import { hasCredentialWarning, providerInfoRows } from '../lib/provider-view';
import { Button, Tag } from 'antd';
import { ProviderIcon } from './provider-icon';

type ProviderCardProps = {
  provider: ModelProvider;
  /** 点击卡片打开编辑对话框。 */
  onEdit: (provider: ModelProvider) => void;
  /** 打开模型管理对话框。 */
  onManageModels: (provider: ModelProvider) => void;
};

export const ProviderCard = ({
  provider,
  onEdit,
  onManageModels,
}: ProviderCardProps) => {
  const warning = hasCredentialWarning(provider);
  const modelCount = provider.enabled_models.length;

  if (!provider.is_enabled) {
    return (
      <section
        className="cursor-pointer gap-0 rounded-large border border-color-border-1 bg-color-bg-1 py-3 transition-colors hover:border-primary-6"
        onClick={() => onEdit(provider)}
      >
        <header className="px-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ProviderIcon providerId={provider.provider_id} />
            {provider.display_name}
          </h3>
          <p className="text-xs text-color-text-3">{provider.provider_id}</p>
        </header>
      </section>
    );
  }

  return (
    <section className="gap-0 rounded-large border border-color-border-1 bg-color-bg-1 py-3">
      <header className="px-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ProviderIcon providerId={provider.provider_id} />
          <button
            type="button"
            /* border-0 bg-transparent p-0：原生 button 的默认灰底/边框/内边距都不要，
               悬停反馈只留名称下划线，键盘聚焦外框保留（focus-visible） */
            className="border-0 bg-transparent p-0 text-left text-color-text-1 underline-offset-4 hover:underline focus-visible:outline-2"
            onClick={() => onEdit(provider)}
          >
            {provider.display_name}
          </button>
          {warning ? <Tag color="error">凭证缺失</Tag> : null}
        </h3>
        <p className="text-xs text-color-text-3">{provider.provider_id}</p>
      </header>
      <div className="flex flex-col gap-1 px-4 pt-2 text-xs">
        {providerInfoRows(provider).map((row) => (
          <p key={row.label} className="flex gap-2">
            <span className="shrink-0 text-color-text-3">{row.label}</span>
            <span className="min-w-0 break-all text-color-text-2">
              {row.value}
            </span>
          </p>
        ))}
      </div>
      <footer className="px-4 pt-2">
        <Button
          htmlType="button"
          type="primary"
          /* 与工具栏主按钮同规格：antd 自带投影不要，层序 bug 会把文字压成深色 */
          className="text-color-white shadow-none"
          icon={<Settings2 className="size-3.5" aria-hidden />}
          onClick={() => onManageModels(provider)}
        >
          管理模型
          {modelCount > 0 ? `（已启用 ${modelCount} 个）` : ''}
        </Button>
      </footer>
    </section>
  );
};
