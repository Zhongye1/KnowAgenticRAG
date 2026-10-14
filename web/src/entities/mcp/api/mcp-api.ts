/**
 * MCP 服务器端点。
 *
 * 只走契约生成的 SDK。列表与单体的响应都包在 `{success, data}` 里且没有声明响应模型，
 * 字段按不可信数据归一。权限由后端判定：列表对登录用户开放（非管理员拿到的是脱敏子集），
 * 其余端点要求管理员。
 */
import { unwrap } from '@/shared/api';
import {
  createMcpServerRouteApiSystemMcpServersPost,
  deleteMcpServerRouteApiSystemMcpServersSlugDelete,
  getMcpServerRouteApiSystemMcpServersSlugGet,
  getMcpServerToolsApiSystemMcpServersSlugToolsGet,
  getMcpServersApiSystemMcpServersGet,
  refreshMcpServerToolsApiSystemMcpServersSlugToolsRefreshPost,
  testMcpServerApiSystemMcpServersSlugTestPost,
  toggleMcpServerToolRouteApiSystemMcpServersSlugToolsToolNameTogglePut,
  updateMcpServerRouteApiSystemMcpServersSlugPut,
  updateMcpServerStatusRouteApiSystemMcpServersSlugStatusPut,
} from '@/shared/api/generated/sdk.gen';

/** 一个 MCP 服务器。 */
export type McpServer = {
  /** 稳定标识；详情页与所有写操作都用它寻址。 */
  slug: string;
  name: string;
  description: string;
  /** `sse` / `streamable_http`；历史数据里可能有已废弃的 `stdio`。 */
  transport: string;
  url: string;
  headers: Record<string, unknown>;
  timeout: number | null;
  sseReadTimeout: number | null;
  tags: string[];
  /** emoji；空串时界面用 🔌 兜底。 */
  icon: string;
  enabled: boolean;
  /** 代码内置的服务器只能停用，不能删除、不能改连接配置。 */
  isBuiltin: boolean;
  /** 历史 stdio MCP：后端强制禁用，需要迁移或删除。 */
  requiresMigration: boolean;
  disabledTools: string[];
  createdBy: string;
  createdAt: string | null;
  updatedAt: string | null;
};

/** 新建 MCP 的载荷；后端 `CreateMcpServerRequest` 是 `extra="forbid"`。 */
export type McpServerCreateInput = {
  slug: string;
  name: string;
  transport: string;
  description?: string;
  url?: string;
  headers?: Record<string, unknown> | null;
  timeout?: number | null;
  sseReadTimeout?: number | null;
  tags?: string[];
  icon?: string;
};

/** 更新 MCP 的载荷；`slug` 不可改，因此不在其中。 */
export type McpServerUpdateInput = Omit<McpServerCreateInput, 'slug'>;

/** MCP 工具的一个入参。 */
export type McpToolParameter = {
  type: string;
  description: string;
};

/** MCP 服务器暴露的一个工具。 */
export type McpTool = {
  name: string;
  /** 后端给的唯一 id（`metadata.id`），与 name 可能不同。 */
  id: string;
  description: string;
  enabled: boolean;
  parameters: Record<string, McpToolParameter>;
  required: string[];
};

const asText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const asTextList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const toMcpServer = (raw: unknown): McpServer | null => {
  const record = asRecord(raw);
  const slug = asText(record.slug);
  if (!slug) return null;

  return {
    slug,
    name: asText(record.name) || slug,
    description: asText(record.description),
    transport: asText(record.transport),
    url: asText(record.url),
    headers: asRecord(record.headers),
    timeout: asNumber(record.timeout),
    sseReadTimeout: asNumber(record.sse_read_timeout),
    tags: asTextList(record.tags),
    icon: asText(record.icon),
    enabled: record.enabled === true,
    isBuiltin: record.is_builtin === true,
    requiresMigration: record.requires_migration === true,
    disabledTools: asTextList(record.disabled_tools),
    createdBy: asText(record.created_by),
    createdAt: asText(record.created_at) || null,
    updatedAt: asText(record.updated_at) || null,
  };
};

/** 把界面形状的载荷折回后端的 snake_case。 */
const toRequestBody = (
  input: McpServerCreateInput | McpServerUpdateInput,
): Record<string, unknown> => {
  const body: Record<string, unknown> = {
    name: input.name,
    transport: input.transport,
  };
  if ('slug' in input && input.slug) body.slug = input.slug;
  if (input.description !== undefined) {
    body.description = input.description || null;
  }
  if (input.url !== undefined) body.url = input.url || null;
  if (input.headers !== undefined) body.headers = input.headers ?? null;
  if (input.timeout !== undefined) body.timeout = input.timeout ?? null;
  if (input.sseReadTimeout !== undefined) {
    body.sse_read_timeout = input.sseReadTimeout ?? null;
  }
  if (input.tags !== undefined) {
    body.tags = input.tags.length ? input.tags : null;
  }
  if (input.icon !== undefined) body.icon = input.icon || null;

  return body;
};

/** 全部 MCP 服务器。 */
export async function listMcpServers(): Promise<McpServer[]> {
  const payload = unwrap<{ data?: unknown }>(
    await getMcpServersApiSystemMcpServersGet(),
  );
  const rows = Array.isArray(payload.data) ? payload.data : [];

  const servers: McpServer[] = [];
  for (const row of rows) {
    const server = toMcpServer(row);
    if (server) servers.push(server);
  }

  return servers;
}

/** 单个 MCP 服务器。 */
export async function getMcpServer(slug: string): Promise<McpServer | null> {
  const payload = unwrap<{ data?: unknown }>(
    await getMcpServerRouteApiSystemMcpServersSlugGet({ path: { slug } }),
  );

  return toMcpServer(payload.data);
}

/** 新建 MCP 服务器。 */
export async function createMcpServer(
  input: McpServerCreateInput,
): Promise<McpServer | null> {
  const payload = unwrap<{ data?: unknown }>(
    await createMcpServerRouteApiSystemMcpServersPost({
      body: toRequestBody(input) as never,
    }),
  );

  return toMcpServer(payload.data);
}

/** 更新 MCP 服务器。 */
export async function updateMcpServer(
  slug: string,
  input: McpServerUpdateInput,
): Promise<McpServer | null> {
  const payload = unwrap<{ data?: unknown }>(
    await updateMcpServerRouteApiSystemMcpServersSlugPut({
      path: { slug },
      body: toRequestBody(input) as never,
    }),
  );

  return toMcpServer(payload.data);
}

/** 删除 MCP 服务器。 */
export async function deleteMcpServer(slug: string): Promise<void> {
  unwrap<unknown>(
    await deleteMcpServerRouteApiSystemMcpServersSlugDelete({ path: { slug } }),
  );
}

/** 启用/停用 MCP 服务器；响应里带后端文案。 */
export async function setMcpServerEnabled(
  slug: string,
  enabled: boolean,
): Promise<{ enabled: boolean; message: string }> {
  const payload = unwrap<{ enabled?: unknown; message?: unknown }>(
    await updateMcpServerStatusRouteApiSystemMcpServersSlugStatusPut({
      path: { slug },
      body: { enabled },
    }),
  );

  return {
    enabled: payload.enabled === true,
    message: asText(payload.message),
  };
}

/** 测试连接；成功时返回发现的工具数。 */
export async function testMcpServer(
  slug: string,
): Promise<{ toolCount: number; message: string }> {
  const payload = unwrap<{ tool_count?: unknown; message?: unknown }>(
    await testMcpServerApiSystemMcpServersSlugTestPost({ path: { slug } }),
  );

  return {
    toolCount: asNumber(payload.tool_count) ?? 0,
    message: asText(payload.message),
  };
}

const toMcpTool = (raw: unknown): McpTool | null => {
  const record = asRecord(raw);
  const name = asText(record.name);
  if (!name) return null;

  const parameters: Record<string, McpToolParameter> = {};
  for (const [key, value] of Object.entries(asRecord(record.parameters))) {
    const parameter = asRecord(value);
    parameters[key] = {
      type: asText(parameter.type),
      description: asText(parameter.description),
    };
  }

  return {
    name,
    id: asText(record.id) || name,
    description: asText(record.description),
    enabled: record.enabled !== false,
    parameters,
    required: asTextList(record.required),
  };
};

/** MCP 服务器暴露的工具列表（含已禁用的）。 */
export async function listMcpServerTools(slug: string): Promise<McpTool[]> {
  const payload = unwrap<{ data?: unknown }>(
    await getMcpServerToolsApiSystemMcpServersSlugToolsGet({
      path: { slug },
    }),
  );
  const rows = Array.isArray(payload.data) ? payload.data : [];

  const tools: McpTool[] = [];
  for (const row of rows) {
    const tool = toMcpTool(row);
    if (tool) tools.push(tool);
  }

  return tools;
}

/** 刷新工具缓存；返回后端的统计文案。 */
export async function refreshMcpServerTools(
  slug: string,
): Promise<{ message: string }> {
  const payload = unwrap<{ message?: unknown }>(
    await refreshMcpServerToolsApiSystemMcpServersSlugToolsRefreshPost({
      path: { slug },
    }),
  );

  return { message: asText(payload.message) };
}

/** 启用/停用单个工具；返回切换后的状态。 */
export async function toggleMcpServerTool(
  slug: string,
  toolName: string,
): Promise<{ enabled: boolean; message: string }> {
  const payload = unwrap<{ enabled?: unknown; message?: unknown }>(
    await toggleMcpServerToolRouteApiSystemMcpServersSlugToolsToolNameTogglePut(
      {
        path: { slug, tool_name: toolName },
      },
    ),
  );

  return {
    enabled: payload.enabled === true,
    message: asText(payload.message),
  };
}
