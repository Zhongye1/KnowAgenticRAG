/**
 * 工具调用的头部文案。
 *
 * 参照实现把每个工具的头部做成一个专用组件（`ToolCallingResult/tools/*.vue`），
 * 但其中绝大多数只是「主文案 + `|` + 关键参数」的变体。本仓用一张按工具 id 分派的
 * 表表达同一套行为，通用外壳只消费这里的结果。
 *
 * 返回 `null` 表示没有专用头部，调用方回落到通用文案（「工具 X 执行完成」）。
 */
import type { ChatToolCall } from '../api/agent-api';
import {
  answeredSummary,
  askQuestionSummary,
  resolveQuestions,
  resolveUserAnswer,
} from './ask-question';
import { kbQuerySummary } from './kb-query-result';
import { buildMemoryView } from './memory';
import { todoHeaderLabel } from './todo-list';
import {
  getToolCallId,
  getToolName,
  parseToolCallArgs,
  parseToolCallResultForDisplay,
} from './tool-call';

export type ToolHeaderSegment = {
  text: string;
  /** 按等宽代码样式渲染。 */
  code?: boolean;
  /** 悬浮提示。 */
  title?: string;
  /** 渲染成小徽标（如「纠正」与行号标签）。 */
  tag?: boolean;
};

export type ToolHeader = {
  /** 头部主文案。 */
  note: string;
  /** `|` 之后依次渲染的片段；空片段会被丢掉。 */
  segments: ToolHeaderSegment[];
  /** 主体里不再重复展示参数。 */
  hideParams?: boolean;
};

export type ToolHeaderContext = {
  /**
   * `kb_id` → 知识库名。
   *
   * 知识库列表属于 `features/knowledge-base`，本模块不能反向依赖它，因此由调用方注入；
   * 拿不到时对应的片段不渲染，避免出现「知识库: <一串 id>」这种半截标签。
   */
  resolveKbName?: (kbId: string) => string;
};

/** 从参数里取字符串字段；非字符串与空串都算没有。 */
function argString(args: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }

  return '';
}

/** `Lines 起-止`；只有 limit 时给 `Lines N`，只有 offset 时给 `From N`。 */
function lineRangeLabel(args: Record<string, unknown>): string {
  const offset = typeof args.offset === 'number' ? args.offset : undefined;
  const limit = typeof args.limit === 'number' ? args.limit : undefined;
  if (offset !== undefined && limit !== undefined) {
    return `Lines ${offset}-${offset + limit}`;
  }
  if (limit !== undefined) return `Lines ${limit}`;
  if (offset !== undefined) return `From ${offset}`;

  return '';
}

/** 写入内容的行数；没有内容时为 0。 */
function contentLineCount(args: Record<string, unknown>): number {
  const content = args.content;
  if (typeof content !== 'string' || !content) return 0;

  return content.split('\n').length;
}

/** 超长文本截断，末尾加省略号。 */
function truncate(text: string, maxLength = 50): string {
  if (text.length <= maxLength) return text;

  return `${text.slice(0, maxLength)}…`;
}

/** 网络搜索的查询词：结果里优先，其次参数里的 `query` / `q`。 */
function webSearchQuery(toolCall: ChatToolCall): string {
  const result = parseToolCallResultForDisplay(toolCall) as {
    query?: unknown;
  } | null;
  if (result && typeof result.query === 'string' && result.query.trim()) {
    return result.query.trim();
  }

  return argString(parseToolCallArgs(toolCall), 'query', 'q');
}

/** 参数里的路径类字段；`dir_path` 优先于 `path`。 */
function pathArg(args: Record<string, unknown>): string {
  return argString(args, 'dir_path', 'path', 'file_path');
}

/** 取路径的最后一段。 */
function baseName(path: string): string {
  return path.split('/').pop() || path;
}

/** `list_kbs` 的摘要：最多列三个名字，其余折成「等 N 个」。 */
function knowledgeBaseSummary(toolCall: ChatToolCall): string {
  const parsed = parseToolCallResultForDisplay(toolCall);
  const list = Array.isArray(parsed) ? parsed : [];
  const names = list
    .map((item) => (item as { name?: unknown } | null)?.name)
    .filter(
      (name): name is string => typeof name === 'string' && Boolean(name),
    );
  if (names.length === 0) return '暂无知识库';

  const preview = names.slice(0, 3).join('，');
  const remaining = names.length - 3;

  return remaining > 0
    ? `${names.length}个知识库：${preview} 等${remaining}个`
    : `${names.length}个知识库：${preview}`;
}

/**
 * 按工具 id 生成头部；没有专用头部时返回 `null`。
 *
 * 需要跨切片数据（知识库名、子智能体运行态）的工具不在这里：它们的头部要等对应切片
 * 提供数据源后再接，当前回落到通用文案。
 */
export function buildToolHeader(
  toolCall: ChatToolCall,
  context: ToolHeaderContext = {},
): ToolHeader | null {
  const toolId = getToolCallId(toolCall);
  const args = parseToolCallArgs(toolCall);
  const detail = (text: string, extra: Partial<ToolHeaderSegment> = {}) =>
    text ? [{ text, ...extra }] : [];
  /** 知识库名：参数里的 `kb_name` 优先，其次由调用方按 `kb_id` 解析。 */
  const kbName = (): string => {
    const fromArgs = argString(args, 'kb_name');
    if (fromArgs) return fromArgs;

    const kbId = argString(args, 'kb_id');

    return kbId && context.resolveKbName ? context.resolveKbName(kbId) : '';
  };

  switch (toolId) {
    case 'bash':
    case 'cmd':
    case 'execute':
    case 'run_shell_command':
      return {
        note: '执行命令',
        segments: detail(argString(args, 'command'), { code: true }),
      };

    case 'glob':
      return {
        note: '匹配文件路径',
        segments: detail(argString(args, 'pattern'), { code: true }),
      };

    case 'list_directory':
    case 'ls':
      return {
        note: '列出目录',
        segments: detail(pathArg(args), { code: true }),
        hideParams: true,
      };

    case 'grep':
    case 'search_file_content': {
      const pattern = argString(args, 'pattern');
      const target = pathArg(args);

      return {
        note: '搜索文件内容',
        segments: [...detail(pattern), ...detail(target, { code: true })],
      };
    }

    case 'read_file': {
      const filePath = argString(args, 'file_path');

      return {
        note: '读取文件',
        segments: [
          ...detail(baseName(filePath), { code: true, title: filePath }),
          ...detail(lineRangeLabel(args)),
        ],
      };
    }

    case 'write_file': {
      const filePath = argString(args, 'file_path');
      const lines = contentLineCount(args);

      return {
        note: '写入文件',
        segments: [
          ...detail(filePath, { code: true }),
          ...detail(lines > 0 ? `+${lines}` : ''),
        ],
      };
    }

    case 'edit_file':
    case 'replace': {
      const filePath = argString(args, 'file_path');

      return {
        note: '编辑文件',
        segments: detail(baseName(filePath), {
          code: true,
          title: filePath,
        }),
      };
    }

    case 'calculator':
      return { note: '计算器', segments: [] };

    case 'web_search':
    case 'tavily_search':
    case 'doubao_search':
      return {
        note: '网络搜索',
        segments: detail(webSearchQuery(toolCall)),
        hideParams: true,
      };

    case 'mysql_list_tables':
      return { note: '列出数据库表', segments: [], hideParams: true };

    case 'mysql_describe_table':
      return {
        note: '查看表结构',
        segments: detail(argString(args, 'table_name', 'table'), {
          code: true,
        }),
        hideParams: true,
      };

    case 'mysql_query': {
      const sql = argString(args, 'sql', 'query');

      return {
        note: '执行SQL查询',
        segments: detail(sql ? truncate(sql) : '', { code: true }),
      };
    }

    case 'ocr_parse_file': {
      const filePath = argString(args, 'file_path');

      return {
        note: 'OCR识别',
        segments: detail(baseName(filePath), { title: filePath }),
      };
    }

    case 'remember_memory': {
      const memory = buildMemoryView(toolCall);

      return {
        note: '更新记忆',
        segments: [
          ...detail(memory.contentPreview),
          ...(memory.isReplace ? [{ text: '纠正', tag: true }] : []),
          ...(memory.lineTag ? [{ text: memory.lineTag, tag: true }] : []),
        ],
      };
    }

    case 'write_todos':
      return {
        note: '任务清单',
        segments: detail(todoHeaderLabel(toolCall)),
        hideParams: true,
      };

    case 'text_to_img_qwen_image':
      return { note: '生成图片', segments: [] };

    case 'chart':
      return { note: '生成图表', segments: [] };

    case 'ask_user_question': {
      const questions = resolveQuestions(toolCall);
      const answered = answeredSummary(resolveUserAnswer(toolCall), questions);

      return {
        note: '提问',
        segments: [
          ...detail(askQuestionSummary(questions)),
          ...(answered ? [{ text: `已回答: ${answered}`, tag: true }] : []),
        ],
        hideParams: true,
      };
    }

    case 'query_kb':
      return {
        note: '搜索知识库',
        segments: [
          ...detail(kbName() ? `知识库: ${kbName()}` : ''),
          ...detail(argString(args, 'query_text')),
          ...detail(kbQuerySummary(toolCall)),
        ],
        hideParams: true,
      };

    case 'search_file':
      return {
        note: '搜索知识库文件',
        segments: [
          ...detail(kbName() ? `知识库: ${kbName()}` : ''),
          ...detail(argString(args, 'query')),
        ],
      };

    case 'find_kb_document':
      return {
        note: '查找知识库文档',
        segments: [
          ...detail(kbName() ? `知识库: ${kbName()}` : ''),
          ...detail(
            argString(args, 'file_id')
              ? `文件: ${argString(args, 'file_id')}`
              : '',
          ),
        ],
      };

    case 'open_kb_document': {
      const line = args.line;
      const offset = args.offset;
      const positionLabel =
        typeof line === 'number' || typeof line === 'string'
          ? `Line ${line}`
          : offset !== undefined
            ? `Offset ${offset}`
            : '';

      return {
        note: '打开知识库文档',
        segments: [
          ...detail(kbName() ? `知识库: ${kbName()}` : ''),
          ...detail(
            argString(args, 'file_id')
              ? `文件: ${argString(args, 'file_id')}`
              : '',
          ),
          ...detail(positionLabel),
        ],
      };
    }

    case 'get_mindmap':
      return {
        note: '获取思维导图',
        segments: detail(kbName() ? `知识库: ${kbName()}` : ''),
      };

    case 'list_kbs':
      return {
        note: '查看知识库列表',
        segments: detail(knowledgeBaseSummary(toolCall)),
      };

    default:
      // 没有专用头部时回落到通用文案；工具名仍由调用方兜底显示
      void getToolName(toolId);
      return null;
  }
}
