import { describe, expect, it } from 'vitest';

import {
  normalizeCodeLanguage,
  normalizeMarkdownTheme,
  renderMarkdown,
} from '@/shared/markdown';

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
