/**
 * 工具调用的纯逻辑：id、显示名、参数与结果的解析，以及隐藏工具的过滤。
 *
 * 逐条对照上游 `components/ToolCallingResult/toolRegistry.js` 的判定分支，
 * 只保留渲染管线需要的部分；子智能体富化随子代理分片补齐。
 */
import type { ChatToolCall } from '../api/agent-api';

/** 后端定义 display_name 之外的工具用这张表兜底；键是工具 id。 */
export const TOOL_NAME_MAP: Record<string, string> = {
  bash: '执行命令',
  cmd: '执行命令',
  execute: '执行命令',
  run_shell_command: '执行命令',
  ls: '列出目录',
  list_directory: '列出目录',
  glob: '匹配文件路径',
  grep: '搜索文件内容',
  read_file: '读取文件',
  remember_memory: '更新记忆',
  write_file: '写入文件',
  edit_file: '编辑文件',
  replace: '编辑文件',
  search_file: '搜索知识库文件',
  search_file_content: '搜索文件内容',
  write_todos: '更新任务清单',
  task: '调用子智能体',
  subagent_start: '启动子智能体',
  subagent_status: '查询子智能体',
  subagent_events: '查看子智能体事件',
  subagent_cancel: '取消子智能体',
  subagent_await: '等待子智能体',
  text_to_img_qwen_image: '生成图片',
  query_kb: '搜索知识库',
  list_kbs: '查看知识库列表',
  find_kb_document: '查找知识库文档',
  open_kb_document: '打开知识库文档',
  get_mindmap: '获取思维导图',
  calculator: '计算器',
  web_search: '网络搜索',
  tavily_search: '网络搜索',
  doubao_search: '网络搜索',
  ocr_parse_file: 'OCR识别文件',
  mysql_list_tables: '列出数据库表',
  mysql_describe_table: '查看表结构',
  mysql_query: '执行SQL查询',
  ask_user_question: '向用户提问',
};

/** 有意不展示的工具调用；分组摘要与渲染共用这一份清单。 */
export const HIDDEN_TOOL_CALL_IDS = ['present_artifacts'];

export const getToolCallId = (toolCall: ChatToolCall | null | undefined): string =>
  toolCall?.name || toolCall?.function?.name || '';

export const getToolName = (toolId: string): string =>
  TOOL_NAME_MAP[toolId] || toolId;

export const isHiddenToolCall = (toolCall: ChatToolCall | null | undefined): boolean =>
  HIDDEN_TOOL_CALL_IDS.includes(getToolCallId(toolCall));

/** 只有能定位到工具、且带参数或结果的条目才可渲染；无 name/id 的条目会被丢掉。 */
export const isValidToolCall = (toolCall: ChatToolCall | null | undefined): boolean =>
  Boolean(
    toolCall &&
      (toolCall.id || toolCall.name || toolCall.function?.name) &&
      (toolCall.args !== undefined ||
        toolCall.function?.arguments !== undefined ||
        toolCall.tool_call_result !== undefined),
  );

/** 解析调用参数；对象直接用，字符串按 JSON 解析，失败返回空对象。 */
export const parseToolCallArgs = (
  toolCall: ChatToolCall | null | undefined,
): Record<string, unknown> => {
  const args = toolCall?.args ?? toolCall?.function?.arguments;
  if (!args) return {};
  if (typeof args === 'object') return args as Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(String(args));
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

/**
 * 渲染用：能解析成 JSON 就用结构化数据，否则原样展示字符串。
 *
 * 展示层必须保底显示原始输出，否则纯文本结果会整段消失。
 */
export const parseToolCallResultForDisplay = (
  toolCall: ChatToolCall | null | undefined,
): unknown => {
  const content = toolCall?.tool_call_result?.content;
  if (content === undefined || content === null || content === '') return null;
  if (typeof content === 'object') return content;
  try {
    return JSON.parse(String(content));
  } catch {
    return String(content);
  }
};

/** 结果展示文案：对象按两空格缩进，其余转成字符串。 */
export const formatToolCallResult = (data: unknown): string => {
  if (data === null || data === undefined) return '';
  return typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
};

/** 过滤无效与隐藏的调用，供分组与渲染共用。 */
export const normalizeToolCalls = (
  toolCalls: ChatToolCall[] | null | undefined,
): ChatToolCall[] => {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls.filter(
    (toolCall) => isValidToolCall(toolCall) && !isHiddenToolCall(toolCall),
  );
};
