/** MCP 面板与详情页的展示与表单逻辑。 */
import type { McpServer } from '@/entities/mcp';

/** 后端接受的传输类型；顺序即下拉顺序。 */
export const MCP_TRANSPORTS = ['streamable_http', 'sse'] as const;

/** 传输类型标签；未知值原样显示。 */
export const transportLabel = (transport: string): string => transport || '-';

/**
 * 卡片与详情页右侧动作按钮的文案。
 *
 * 需迁移的只能删；已停用的可以添加；内置的只能从当前配置里移除（不能删库）。
 */
export const mcpActionLabel = (server: McpServer): string => {
  if (server.requiresMigration) return '删除';
  if (!server.enabled) return '添加';

  return server.isBuiltin ? '移除' : '删除';
};

/** 卡片上的动作是否是「危险」语义（删除）。 */
export const isMcpRemoveAction = (server: McpServer): boolean =>
  server.requiresMigration || server.enabled;

/** 按名称排序：中文按拼音、数字按数值。 */
export const sortMcpServers = (servers: McpServer[]): McpServer[] =>
  [...servers].sort((left, right) =>
    left.name.localeCompare(right.name, 'zh-Hans-CN', {
      sensitivity: 'base',
      numeric: true,
    }),
  );

/** 搜索：名称与描述参与匹配，大小写不敏感。 */
export const filterMcpServers = (
  servers: McpServer[],
  keyword: string,
): McpServer[] => {
  const needle = keyword.trim().toLowerCase();
  if (!needle) return servers;

  return servers.filter(
    (server) =>
      server.name.toLowerCase().includes(needle) ||
      server.description.toLowerCase().includes(needle),
  );
};

/** 拆成「已添加」与「可添加」两组。 */
export const splitMcpServers = (
  servers: McpServer[],
): { enabled: McpServer[]; disabled: McpServer[] } => ({
  enabled: servers.filter((server) => server.enabled),
  disabled: servers.filter((server) => !server.enabled),
});

/** 请求头 JSON → 对象；空串给 null，格式错误给出文案。 */
export const parseMcpHeaders = (
  text: string,
): { headers: Record<string, unknown> | null; error: string | null } => {
  const trimmed = text.trim();
  if (!trimmed) return { headers: null, error: null };

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return { headers: null, error: '请求头必须是 JSON 对象' };
    }

    return { headers: parsed as Record<string, unknown>, error: null };
  } catch {
    return { headers: null, error: '请求头 JSON 格式错误' };
  }
};

/** 请求头对象 → 文本框里的 JSON；空对象给空串。 */
export const formatMcpHeaders = (headers: Record<string, unknown>): string =>
  Object.keys(headers).length ? JSON.stringify(headers, null, 2) : '';

/** 表单值：与 `McpFormValues` 同形，供「服务器 → 表单」的反向映射使用。 */
export type McpFormValues = {
  slug: string;
  name: string;
  description: string;
  transport: string;
  url: string;
  headersText: string;
  timeout: number | null;
  sseReadTimeout: number | null;
  tags: string[];
  icon: string;
};

/** 服务器 → 表单初值；编辑态打开弹窗时用它带出已保存值。 */
export const mcpFormFromServer = (server: McpServer): McpFormValues => ({
  slug: server.slug,
  name: server.name,
  description: server.description,
  transport: server.transport || 'streamable_http',
  url: server.url,
  headersText: formatMcpHeaders(server.headers),
  timeout: server.timeout,
  sseReadTimeout: server.sseReadTimeout,
  tags: server.tags,
  icon: server.icon,
});

/**
 * 提交前校验；通过返回 null。
 *
 * `editing` 为真时 `slug` 由后端持有、界面只读，因此跳过它的校验。
 */
export const validateMcpForm = (
  values: McpFormValues,
  options: { editing: boolean },
): string | null => {
  if (!options.editing && !values.slug.trim()) return 'MCP 标识不能为空';
  if (!values.name.trim()) return 'MCP 名称不能为空';
  if (!values.transport) return '请选择传输类型';
  if (
    MCP_TRANSPORTS.includes(values.transport as never) &&
    !values.url.trim()
  ) {
    return 'HTTP 类型必须填写 MCP URL';
  }

  return parseMcpHeaders(values.headersText).error;
};
