/**
 * 供应商卡片。
 *
 * 启用的卡显示 Base URL、能力行、凭证缺失徽标与「管理模型」入口；停用态只显示名称与 id。
 * 图标固定用 lucide 的 `Globe`，不引入第三方品牌图标来源。
 */
import { Globe, Settings2 } from 'lucide-react';

import type { ModelProvider } from '../api/model-provider-api';
import { hasCredentialWarning, providerInfoRows } from '../lib/provider-view';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card';

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
      <Card
        className="cursor-pointer gap-0 py-3 transition-colors hover:border-primary-6"
        onClick={() => onEdit(provider)}
      >
        <CardHeader className="px-4">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Globe className="size-4 text-color-text-3" aria-hidden />
            {provider.display_name}
          </CardTitle>
          <p className="text-xs text-color-text-3">{provider.provider_id}</p>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="gap-0 py-3">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Globe className="size-4 text-color-text-3" aria-hidden />
          <button
            type="button"
            className="text-left underline-offset-4 hover:underline focus-visible:outline-2"
            onClick={() => onEdit(provider)}
          >
            {provider.display_name}
          </button>
          {warning ? <Badge variant="destructive">凭证缺失</Badge> : null}
        </CardTitle>
        <p className="text-xs text-color-text-3">{provider.provider_id}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 px-4 pt-2 text-xs">
        {providerInfoRows(provider).map((row) => (
          <p key={row.label} className="flex gap-2">
            <span className="shrink-0 text-color-text-3">{row.label}</span>
            <span className="min-w-0 break-all text-color-text-2">
              {row.value}
            </span>
          </p>
        ))}
      </CardContent>
      <CardFooter className="px-4 pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<Settings2 className="size-3.5" aria-hidden />}
          onClick={() => onManageModels(provider)}
        >
          管理模型
          {modelCount > 0 ? `（已启用 ${modelCount} 个）` : ''}
        </Button>
      </CardFooter>
    </Card>
  );
};
