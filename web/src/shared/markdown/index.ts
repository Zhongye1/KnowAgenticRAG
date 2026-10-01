/**
 * markdown 段的对外接口。
 *
 * 单独成段而不是放进 `shared/lib`：渲染管线带 shiki 与 KaTeX，体积远大于一般工具，
 * 混在 lib 的 barrel 里会把它们拖进所有引用 lib 的地方。
 */
export { normalizeCodeLanguage, normalizeMarkdownTheme, renderMarkdown } from './render';
export type { MarkdownTheme } from './render';
