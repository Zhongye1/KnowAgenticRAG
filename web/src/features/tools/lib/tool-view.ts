/** 工具面板的展示逻辑。 */
import type { Tool } from '@/entities/tool';

/** 已知分类的中文名；未登记的按原始键显示。 */
const CATEGORY_LABELS: Record<string, string> = {
  buildin: '内置工具',
  knowledge: '知识库',
  mysql: 'MySQL',
  debug: '调试',
};

export const toolCategoryLabel = (category: string): string =>
  CATEGORY_LABELS[category] || category;

/** 工具卡片上的标签：分类在最前，其余标签取前两个。 */
export const toolCardTags = (tool: Tool): string[] => {
  const tags = [
    ...(tool.category ? [toolCategoryLabel(tool.category)] : []),
    ...tool.tags.slice(0, 2),
  ];

  return [...new Set(tags)];
};

/** 数据里出现过的分类，按中文名排序。 */
export const toolCategoryOptions = (
  tools: Tool[],
): Array<{ value: string; label: string }> => {
  const seen = new Set<string>();
  for (const tool of tools) {
    if (tool.category) seen.add(tool.category);
  }

  return [...seen]
    .map((value) => ({ value, label: toolCategoryLabel(value) }))
    .sort((left, right) => left.label.localeCompare(right.label, 'zh-Hans-CN'));
};

/** 搜索：名称、slug、描述与配置说明都参与匹配，大小写不敏感。 */
export const filterTools = (
  tools: Tool[],
  options: { keyword: string; category: string },
): Tool[] => {
  const keyword = options.keyword.trim().toLowerCase();

  return tools.filter((tool) => {
    if (options.category && tool.category !== options.category) return false;
    if (!keyword) return true;

    return (
      tool.name.toLowerCase().includes(keyword) ||
      tool.slug.toLowerCase().includes(keyword) ||
      tool.description.toLowerCase().includes(keyword) ||
      tool.configGuide.toLowerCase().includes(keyword)
    );
  });
};
