/**
 * 工具调用图标表。
 *
 * 与上游 `ToolCallingResult/toolRegistry.js` 的 `TOOL_ICON_MAP` 同键，
 * 未命中的工具用通用图标兜底。
 */
import {
  BookOpen,
  Bot,
  Brain,
  Calculator,
  CheckSquare,
  CircleDot,
  Database,
  FileEdit,
  FilePen,
  FileText,
  Folder,
  FolderOutput,
  FolderSearch,
  Globe,
  HelpCircle,
  Image,
  Network,
  RefreshCw,
  SquareTerminal,
  type LucideIcon,
} from 'lucide-react';

const TOOL_ICON_MAP: Record<string, LucideIcon> = {
  ask_user_question: HelpCircle,
  bash: SquareTerminal,
  calculator: Calculator,
  cmd: SquareTerminal,
  edit_file: FilePen,
  execute: SquareTerminal,
  find_kb_document: FolderSearch,
  get_mindmap: Network,
  glob: FolderSearch,
  grep: FolderSearch,
  list_directory: Folder,
  list_kbs: BookOpen,
  ls: Folder,
  mysql_describe_table: Database,
  mysql_list_tables: Database,
  mysql_query: Database,
  ocr_parse_file: FileText,
  open_kb_document: FileText,
  present_artifacts: FolderOutput,
  query_kb: BookOpen,
  read_file: FileText,
  remember_memory: Brain,
  replace: FilePen,
  run_shell_command: SquareTerminal,
  search_file: FolderSearch,
  search_file_content: FolderSearch,
  subagent_await: Bot,
  subagent_cancel: Bot,
  subagent_events: RefreshCw,
  subagent_start: Bot,
  subagent_status: RefreshCw,
  task: Bot,
  web_search: Globe,
  tavily_search: Globe,
  doubao_search: Globe,
  text_to_img_qwen_image: Image,
  write_file: FileEdit,
  write_todos: CheckSquare,
};

/** 取工具图标；未登记的工具用中性图标，避免渲染层出现空位。 */
export const getToolIcon = (toolId: string): LucideIcon =>
  TOOL_ICON_MAP[toolId] ?? CircleDot;
