import { describe, expect, it } from 'vitest';

import {
  normalizeCodeLanguage,
  normalizeMarkdownTheme,
  renderCodeBlock,
  renderMarkdown,
} from '@/shared/markdown';
import { resolvePlugin } from '@/shared/markdown/render';

describe('normalizeCodeLanguage', () => {
  it('把常见别名映射成 shiki 认的名字', () => {
    expect(normalizeCodeLanguage('ts')).toBe('typescript');
    expect(normalizeCodeLanguage('py')).toBe('python');
    expect(normalizeCodeLanguage('sh')).toBe('shellscript');
    expect(normalizeCodeLanguage('.yml')).toBe('yaml');
  });

  it('未知语言与空值按原样处理', () => {
    expect(normalizeCodeLanguage('haskell')).toBe('haskell');
    expect(normalizeCodeLanguage('')).toBe('');
    expect(normalizeCodeLanguage(undefined)).toBe('');
  });
});

describe('normalizeMarkdownTheme', () => {
  it('只认暗色主题，其余回退到亮色', () => {
    expect(normalizeMarkdownTheme('github-dark')).toBe('github-dark');
    expect(normalizeMarkdownTheme('github-light')).toBe('github-light');
    expect(normalizeMarkdownTheme(undefined)).toBe('github-light');
    expect(normalizeMarkdownTheme('solarized')).toBe('github-light');
  });
});

describe('renderMarkdown', () => {
  it('渲染基础 Markdown 结构', async () => {
    const html = await renderMarkdown('# 标题\n\n正文**加粗**');

    expect(html).toContain('<h1');
    expect(html).toContain('<strong>加粗</strong>');
  });

  it('空内容返回空串', async () => {
    expect(await renderMarkdown('')).toBe('');
  });

  it('消毒脚本与事件属性（负向）', async () => {
    const html = await renderMarkdown(
      '<script>alert(1)</script>\n\n<img src=x onerror="alert(2)">',
    );

    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
  });

  it('渲染任务列表复选框', async () => {
    const html = await renderMarkdown('- [x] 已完成\n- [ ] 未完成');

    expect(html).toContain('type="checkbox"');
  });

  it('渲染 KaTeX 公式', async () => {
    const html = await renderMarkdown('质能方程 $E = mc^2$');

    expect(html).toContain('katex');
  });

  it('代码围栏按主题产出高亮样式', async () => {
    const light = await renderMarkdown('```ts\nconst a = 1\n```', {
      theme: 'github-light',
    });
    const dark = await renderMarkdown('```ts\nconst a = 1\n```', {
      theme: 'github-dark',
    });

    expect(light).toContain('<pre');
    expect(light).not.toEqual(dark);
  });

  it('同一内容重复渲染走缓存但结果一致', async () => {
    const first = await renderMarkdown('缓存**检查**');
    const second = await renderMarkdown('缓存**检查**');

    expect(second).toBe(first);
  });
});

describe('resolvePlugin', () => {
  const plugin = () => undefined;

  it('Node 与浏览器两种形状都吃', () => {
    // Node：默认导入就是函数
    expect(resolvePlugin(plugin)).toBe(plugin);
    // 浏览器（Vite 对 CJS 的 interop）：{ default: fn }
    expect(resolvePlugin({ default: plugin })).toBe(plugin);
  });
});

describe('renderCodeBlock', () => {
  it('认得出语言时给出高亮结果', async () => {
    const html = await renderCodeBlock('print(1)', 'py');

    expect(html).toContain('shiki');
    expect(html).toContain('print');
  });

  it('认不出语言或没有语言时返回空串，由调用方按纯文本渲染', async () => {
    expect(await renderCodeBlock('print(1)', '')).toBe('');
    expect(await renderCodeBlock('print(1)', 'not-a-language-xyz')).toBe('');
    expect(await renderCodeBlock('', 'python')).toBe('');
  });
});

describe('renderMarkdown', () => {
  it('正文照常渲染，公式插件不会拖垮整段', async () => {
    const html = await renderMarkdown('# 标题\n\n$E=mc^2$\n');

    expect(html).toContain('<h1>');
    expect(html).toContain('标题');
  });

  it('围栏代码走到高亮', async () => {
    const html = await renderMarkdown('```python\nprint(1)\n```\n');

    expect(html).toContain('shiki');
  });
});
