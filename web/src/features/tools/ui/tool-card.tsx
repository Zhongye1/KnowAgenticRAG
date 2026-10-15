/** 工具卡片：工具面板里的一张卡。 */
import * as React from 'react';

import type { Tool } from '@/entities/tool';
import { formatExtensionTitle } from '@/shared/lib';
import { InfoCard, type InfoCardTag } from '@/shared/ui/info-card';
import { getToolIcon } from '@/shared/ui/tool-icons';

import { toolCardTags } from '../lib/tool-view';

type ToolCardProps = {
  tool: Tool;
  onOpen: (tool: Tool) => void;
};

export const ToolCard = ({ tool, onOpen }: ToolCardProps) => {
  const tags: InfoCardTag[] = toolCardTags(tool).map((name) => ({
    // 分类标签带颜色键（内置 blue / 知识库 purple），其余灰
    name,
    color: name === '内置工具' || name === 'MySQL' ? 'blue' : 'gray',
  }));

  return (
    <InfoCard
      slug={tool.slug}
      title={formatExtensionTitle(tool.name) || tool.slug}
      subtitle={tool.slug}
      description={tool.description || '无描述'}
      tags={tags}
      onOpen={() => onOpen(tool)}
      icon={React.createElement(getToolIcon(tool.slug), {
        className: 'size-4.5 text-[var(--gray-600)]',
        'aria-hidden': true,
      })}
    />
  );
};
