/**
 * `markdown-it-task-lists` 不自带类型声明，这里补最小声明。
 * 该插件只做一件事：把 `- [ ]` / `- [x]` 渲染成复选框。
 */
declare module 'markdown-it-task-lists' {
  import type { MarkdownIt } from 'markdown-it';

  interface TaskListsOptions {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }

  const taskLists: MarkdownIt.PluginWithOptions<TaskListsOptions>;
  export default taskLists;
}
