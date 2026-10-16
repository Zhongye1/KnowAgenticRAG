/**
 * 工具端点。
 *
 * 只走契约生成的 SDK，响应类型复用生成物 `ToolListResponse`（条目 `ToolItem`）。字段仍按
 * 不可信数据归一：缺 slug 的条目丢掉，`args` / `tags` 不是数组时按空数组处理，并折成界面用的
 * 驼峰形状 `Tool`。
 */
import { unwrap } from '@/shared/api';
import { listToolsApiSystemToolsGet } from '@/shared/api/generated/sdk.gen';
import type { ToolListResponse } from '@/shared/api/generated/types.gen';

/** 工具的一个入参。 */
export type ToolArgument = {
  name: string;
  type: string;
  description: string;
};

/** 一个内置工具。 */
export type Tool = {
  /** 稳定标识；也是卡片副标题与图标查表的键。 */
  slug: string;
  name: string;
  description: string;
  /** 分类键（`buildin` / `knowledge` / `mysql` / `debug` 等）。 */
  category: string;
  tags: string[];
  /** 配置说明；只有需要外部依赖的工具才有。 */
  configGuide: string;
  args: ToolArgument[];
};

const asText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const asTextList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

const toTool = (raw: unknown): Tool | null => {
  if (typeof raw !== 'object' || raw === null) return null;

  const record = raw as Record<string, unknown>;
  const slug = asText(record.slug) || asText(record.id);
  if (!slug) return null;

  const args: ToolArgument[] = [];
  for (const entry of Array.isArray(record.args) ? record.args : []) {
    if (typeof entry !== 'object' || entry === null) continue;
    const arg = entry as Record<string, unknown>;
    const name = asText(arg.name);
    if (!name) continue;
    args.push({
      name,
      type: asText(arg.type),
      description: asText(arg.description),
    });
  }

  return {
    slug,
    name: asText(record.name) || slug,
    description: asText(record.description),
    category: asText(record.category) || 'buildin',
    tags: asTextList(record.tags),
    configGuide: asText(record.config_guide),
    args,
  };
};

/** 全部内置工具。 */
export async function listTools(): Promise<Tool[]> {
  const payload = unwrap<ToolListResponse>(await listToolsApiSystemToolsGet());
  const rows = Array.isArray(payload.data) ? payload.data : [];

  const tools: Tool[] = [];
  for (const row of rows) {
    const tool = toTool(row);
    if (tool) tools.push(tool);
  }

  return tools;
}
