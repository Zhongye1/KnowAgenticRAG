/**
 * 供应商品牌图标。
 *
 * `provider_id` → `@lobehub/icons` 品牌组件的映射只收已知品牌（后端
 * `ars/models/providers/builtin.py` 是事实源，另含其中注释保留的 anthropic / google）：
 * `-cn` / `-coding-plan` 等变体归并到同一品牌。其余自定义供应商回落到 Globe，不猜品牌。
 *
 * 导入的是各品牌的默认导出，即 Mono 形态（`fill: currentColor`），颜色跟随标题文字色；
 * 品牌原色的 `Color` 形态只存在于部分品牌，本次不用。
 */
import { Globe } from 'lucide-react';

import {
  Anthropic,
  DeepSeek,
  Gemini,
  Kimi,
  Minimax,
  ModelScope,
  Moonshot,
  OpenAI,
  OpenCode,
  OpenRouter,
  Qwen,
  SiliconCloud,
  XiaomiMiMo,
  ZAI,
  Zhipu,
} from '@lobehub/icons';

import type { ComponentType, SVGProps } from 'react';

type IconComponent = ComponentType<
  SVGProps<SVGSVGElement> & { size?: string | number }
>;

const PROVIDER_ICONS: Record<string, IconComponent> = {
  openai: OpenAI,
  anthropic: Anthropic,
  google: Gemini,
  deepseek: DeepSeek,
  alibaba: Qwen,
  'alibaba-cn': Qwen,
  'alibaba-coding-plan': Qwen,
  'alibaba-coding-plan-cn': Qwen,
  zhipuai: Zhipu,
  'zhipuai-coding-plan': Zhipu,
  zai: ZAI,
  'zai-coding-plan': ZAI,
  xiaomi: XiaomiMiMo,
  'xiaomi-token-plan-cn': XiaomiMiMo,
  'kimi-for-coding': Kimi,
  moonshotai: Moonshot,
  'moonshotai-cn': Moonshot,
  minimax: Minimax,
  'minimax-cn': Minimax,
  openrouter: OpenRouter,
  modelscope: ModelScope,
  opencode: OpenCode,
  'opencode-go': OpenCode,
  siliconflow: SiliconCloud,
  'siliconflow-cn': SiliconCloud,
};

export type ProviderIconProps = {
  providerId: string;
  /** 图标边长；卡片标题与原 Globe 一致用 16。 */
  size?: number;
  className?: string;
};

/** 供应商卡片标题处的品牌图标；映射未命中时渲染 Globe。 */
export const ProviderIcon = ({
  providerId,
  size = 16,
  className,
}: ProviderIconProps) => {
  // provider_id 是用户输入，`constructor` 这类合法 id 会命中原型属性，只认自有键
  const BrandIcon = Object.hasOwn(PROVIDER_ICONS, providerId)
    ? PROVIDER_ICONS[providerId]
    : undefined;
  if (!BrandIcon) {
    return (
      <Globe
        className={`size-4 shrink-0 text-color-text-3 ${className ?? ''}`}
        aria-hidden
      />
    );
  }
  return (
    <BrandIcon width={size} height={size} className={className} aria-hidden />
  );
};
