/**
 * 提及候选项的类型图标。
 *
 * 文件类型不在这里：文件的图标要看扩展名，由调用方按文件名决定。
 */
import {
  BookOpen,
  Bot,
  Plug,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';

import type { MentionType } from '../lib/mention-token';

/** 图标尺寸与描边。 */
export const MENTION_ICON_SIZE = 15;
export const MENTION_ICON_STROKE_WIDTH = 2.2;

const TYPE_ICONS: Record<Exclude<MentionType, 'file'>, LucideIcon> = {
  knowledge: BookOpen,
  skill: WandSparkles,
  mcp: Plug,
  subagent: Bot,
};

/** 取类型图标；文件类型与未登记类型落到通用图标。 */
export const getMentionIcon = (type: string): LucideIcon =>
  TYPE_ICONS[type as Exclude<MentionType, 'file'>] ?? Plug;
