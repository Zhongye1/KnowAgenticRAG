/**
 * Markdown 渲染管线。
 *
 * markdown-it（html/breaks/linkify/typographer）、KaTeX 公式、任务列表、shiki 代码高亮
 * （亮暗两套主题，按需加载语言）、DOMPurify 消毒。文件预览里的 SVG 块与 HTML 预览块不在
 * 本模块，它们服务于文件预览而不是对话文本。
 */
import DOMPurify from 'dompurify';
import katexModule from '@vscode/markdown-it-katex';
import MarkdownIt from 'markdown-it';
import type { MarkdownIt as MarkdownItInstance } from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import { createHighlighter, type Highlighter } from 'shiki';

export type MarkdownTheme = 'github-light' | 'github-dark';

/**
 * CJS 插件的两种形状：消费方经过转译（esModuleInterop / vitest）时默认导入就是插件函数，
 * 浏览器里 Vite 预处理 CJS 后给的是 `{ __esModule: true, default: fn }`
 * （`@vscode/markdown-it-katex` 实测如此）。两种都要接受，否则整个渲染管线会抛错、
 * 正文一个字都出不来。
 */
export const resolvePlugin = <T>(module: T | { default: T }): T =>
  typeof module === 'function' ? module : (module as { default: T }).default;

const katexPlugin = resolvePlugin<typeof katexModule>(katexModule);

/**
 * 只应用形状正确的插件：少一个插件总好过整段正文渲染不出来。
 * 同样形状问题也发生在降级渲染路径上，所以两处都走它。
 */
const usePlugin = (
  md: MarkdownItInstance,
  plugin: unknown,
  options?: unknown,
): void => {
  if (typeof plugin !== 'function') return;
  if (options === undefined) {
    md.use(plugin as never);
    return;
  }
  md.use(plugin as never, options as never);
};

const THEMES: MarkdownTheme[] = ['github-light', 'github-dark'];
const MAX_RENDER_CACHE_SIZE = 100;

/** 常见围栏语言别名；shiki 认不出时按原样尝试，失败则退化为纯文本。 */
const LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  py: 'python',
  sh: 'shellscript',
  bash: 'shellscript',
  zsh: 'shellscript',
  yml: 'yaml',
  md: 'markdown',
  vue: 'vue',
  rs: 'rust',
  kt: 'kotlin',
};

let highlighterPromise: Promise<Highlighter> | undefined;

/** 惰性创建 shiki 高亮器；失败后允许下次重试。 */
function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: THEMES,
      langs: ['plaintext'],
    }).catch((error) => {
      highlighterPromise = undefined;
      throw error;
    });
  }
  return highlighterPromise;
}

/** 把围栏语言规范化成 shiki 认的名字。 */
export function normalizeCodeLanguage(language: unknown): string {
  const raw = String(language ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\./, '');
  if (!raw) return '';
  return LANGUAGE_ALIASES[raw] ?? raw;
}

const CODE_FENCE_LANGUAGE_RE = /(^|\n) {0,3}(```+|~~~+)[ \t]*([^\s:,`]*)/g;

/** 收集正文里出现的围栏语言，供高亮器按需加载。 */
function collectCodeFenceLanguages(content: string): string[] {
  const languages = new Set<string>();
  for (const match of content.matchAll(CODE_FENCE_LANGUAGE_RE)) {
    const language = normalizeCodeLanguage(match[3]);
    if (language) languages.add(language);
  }
  return [...languages];
}

/** 按需加载语言；单个语言失败不影响其余渲染。 */
async function ensureLanguages(
  highlighter: Highlighter,
  languages: string[],
): Promise<void> {
  const loaded = new Set(highlighter.getLoadedLanguages());
  await Promise.all(
    languages
      .filter((language) => !loaded.has(language))
      .map((language) =>
        highlighter.loadLanguage(language as never).catch(() => null),
      ),
  );
}

/** 渲染器按主题缓存；正文渲染结果按「主题 + 内容」缓存，上限 100 条。 */
const rendererCache = new Map<MarkdownTheme, MarkdownItInstance>();
const renderedHtmlCache = new Map<string, string>();

export function normalizeMarkdownTheme(theme?: string | null): MarkdownTheme {
  return theme === 'github-dark' ? 'github-dark' : 'github-light';
}

async function createRenderer(
  theme: MarkdownTheme,
  highlighter: Highlighter,
): Promise<MarkdownItInstance> {
  const cached = rendererCache.get(theme);
  if (cached) return cached;

  const md = new MarkdownIt({
    html: true,
    breaks: true,
    linkify: true,
    typographer: true,
    highlight: (code, lang) => {
      const language = normalizeCodeLanguage(lang);
      if (!language) return '';
      try {
        return highlighter.codeToHtml(code, { lang: language, theme });
      } catch {
        return '';
      }
    },
  });

  usePlugin(md, katexPlugin);
  usePlugin(md, taskLists, { enabled: true, label: true });
  rendererCache.set(theme, md);
  return md;
}

/**
 * 把一段代码渲染成已消毒的高亮 HTML（文件预览的文本与代码视图用）。
 *
 * 语言认不出或高亮器不可用时返回空串，调用方按纯文本渲染。
 */
export async function renderCodeBlock(
  code: string,
  language: string,
  options: { theme?: string | null } = {},
): Promise<string> {
  const source = String(code ?? '');
  if (!source) return '';

  const normalizedLanguage = normalizeCodeLanguage(language);
  if (!normalizedLanguage) return '';

  const theme = normalizeMarkdownTheme(options.theme);
  try {
    const highlighter = await getHighlighter();
    await ensureLanguages(highlighter, [normalizedLanguage]);
    if (!highlighter.getLoadedLanguages().includes(normalizedLanguage)) {
      return '';
    }
    return DOMPurify.sanitize(
      highlighter.codeToHtml(source, {
        lang: normalizedLanguage,
        theme,
      }),
    );
  } catch {
    return '';
  }
}

/**
 * 把 Markdown 渲染成已消毒的 HTML。
 *
 * 高亮器不可用时退化为无高亮的渲染，正文仍然可见。
 */
export async function renderMarkdown(
  content: string,
  options: { theme?: string | null } = {},
): Promise<string> {
  const source = String(content ?? '');
  if (!source) return '';

  const theme = normalizeMarkdownTheme(options.theme);
  const cacheKey = `${theme}\u0000${source}`;
  const cached = renderedHtmlCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let html: string;
  try {
    const highlighter = await getHighlighter();
    await ensureLanguages(highlighter, collectCodeFenceLanguages(source));
    const md = await createRenderer(theme, highlighter);
    html = md.render(source);
  } catch {
    // 高亮器不可用时不再重试，直接用无高亮的实例渲染同一份正文
    const fallback = new MarkdownIt({
      html: true,
      breaks: true,
      linkify: true,
    });
    usePlugin(fallback, katexPlugin);
    html = fallback.render(source);
  }

  const sanitized = DOMPurify.sanitize(html);
  if (renderedHtmlCache.size >= MAX_RENDER_CACHE_SIZE) {
    const oldest = renderedHtmlCache.keys().next().value;
    if (oldest !== undefined) renderedHtmlCache.delete(oldest);
  }
  renderedHtmlCache.set(cacheKey, sanitized);
  return sanitized;
}
