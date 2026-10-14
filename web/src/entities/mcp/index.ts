/**
 * MCP 切片的对外接口。扩展页的「MCP」tab 与 MCP 详情页都从这里引用。
 */
export {
  createMcpServer,
  deleteMcpServer,
  getMcpServer,
  listMcpServerTools,
  listMcpServers,
  refreshMcpServerTools,
  setMcpServerEnabled,
  testMcpServer,
  toggleMcpServerTool,
  updateMcpServer,
} from './api/mcp-api';
export type {
  McpServer,
  McpServerCreateInput,
  McpServerUpdateInput,
  McpTool,
  McpToolParameter,
} from './api/mcp-api';
export {
  MCP_SERVERS_QUERY_KEY,
  useCreateMcpServer,
  useDeleteMcpServer,
  useMcpServer,
  useMcpServers,
  useMcpServerTools,
  useRefreshMcpServerTools,
  useSetMcpServerEnabled,
  useTestMcpServer,
  useToggleMcpServerTool,
  useUpdateMcpServer,
} from './model/mcp-queries';
