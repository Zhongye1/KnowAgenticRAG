/**
 * 导航列的条目声明与命中判定。
 *
 * 顺序与文案取自参照实现 `AppLayout.vue` 的 `mainList`：新建对话、智能体、个人空间、
 * 扩展，超管再加数据总览。「扩展」的文案随知识库能力切换，与参照一致。
 */
import {
  BarChart3,
  Box,
  HardDrive,
  LibraryBig,
  MessageCirclePlus,
  type LucideIcon,
} from 'lucide-react';

import { paths } from '@/shared/config';

export type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  /** 主操作项，视觉上与其余导航项区分。 */
  primary?: boolean;
  /** 只在路径完全相等时命中；「新建对话」用它避免吞掉带 thread_id 的对话页。 */
  exactActive?: boolean;
};

/** 按角色与能力发现拼出导航项；顺序与参照一致。 */
export function buildNavItems(options: {
  knowledgeEnabled: boolean;
  isSuperuser: boolean;
}): NavItem[] {
  const items: NavItem[] = [
    {
      title: '新建对话',
      url: paths.app.chat.path,
      icon: MessageCirclePlus,
      primary: true,
      exactActive: true,
    },
    {
      title: '智能体',
      url: paths.app.agentManage.path,
      icon: Box,
    },
    {
      title: '个人空间',
      url: paths.app.workspace.path,
      icon: HardDrive,
    },
    {
      title: options.knowledgeEnabled ? '知识库 · 技能' : '技能',
      url: paths.app.extensions.path,
      icon: LibraryBig,
    },
  ];

  if (options.isSuperuser) {
    items.push({
      title: '数据总览',
      url: paths.app.dashboard.path,
      icon: BarChart3,
    });
  }

  return items;
}

/**
 * 命中判定：`exactActive` 项只认完全相等，其余认自身与子路径。
 * 扩展页的子路径（知识库详情、技能详情、MCP 详情）因此都算命中「扩展」。
 */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.exactActive) return pathname === item.url;

  return pathname === item.url || pathname.startsWith(`${item.url}/`);
}
