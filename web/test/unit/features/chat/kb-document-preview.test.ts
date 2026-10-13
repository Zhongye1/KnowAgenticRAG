import { describe, expect, it } from 'vitest';

import type { ChatToolCall } from '@/features/chat/api/agent-api';
import {
  isMatchedLine,
  isPreviewResult,
  lineNumberOf,
  parseDocumentPreview,
  windowKey,
  windowTitle,
} from '@/features/chat/lib/kb-document-preview';
import { buildToolResultView } from '@/features/chat/lib/tool-result';

const call = (name: string, content: unknown): ChatToolCall => ({
  id: 'call-1',
  name,
  function: { name, arguments: '{}' },
  status: 'success',
  tool_call_result: { content },
});

describe('isPreviewResult', () => {
  it('只有对象且 content 是字符串才算可预览', () => {
    expect(isPreviewResult({ content: '正文' })).toBe(true);
    expect(isPreviewResult({ content: 123 })).toBe(false);
    expect(isPreviewResult('正文')).toBe(false);
    expect(isPreviewResult(null)).toBe(false);
  });
});

describe('parseDocumentPreview', () => {
  it('单个文档走 content，摘要给行号区间', () => {
    const preview = parseDocumentPreview(
      { content: '1\tA', start_line: 1, end_line: 9, total_lines: 100 },
      'open',
    );

    expect(preview?.summary).toBe('打开文档: 第 1-9 行 / 共 100 行');
    expect(preview?.windows).toHaveLength(1);
  });

  it('有后续时摘要带上下一段 offset', () => {
    const preview = parseDocumentPreview(
      {
        content: '1\tA',
        start_line: 1,
        end_line: 9,
        total_lines: 100,
        has_more_after: true,
        next_offset: 9,
      },
      'open',
    );

    expect(preview?.summary).toBe('打开文档: 第 1-9 行 / 共 100 行，下一段 offset 9');
  });

  it('查找模式给匹配数与窗口数，正则会写明', () => {
    const preview = parseDocumentPreview(
      { windows: [{ content: '1\tA' }, { content: '2\tB' }], total_matches: 3 },
      'find',
    );

    expect(preview?.summary).toBe('关键词查找: 3 处匹配，2 个上下文窗口');
    expect(
      parseDocumentPreview(
        { windows: [{ content: '1\tA' }], total_matches: 0, match_mode: 'regex' },
        'find',
      )?.summary,
    ).toBe('正则查找: 0 处匹配，1 个上下文窗口');
  });

  it('windows 优先于 content，且丢掉没有正文的窗口', () => {
    const preview = parseDocumentPreview(
      { content: '顶层', windows: [{ content: 'A' }, { start_line: 1 }] },
      'open',
    );

    expect(preview?.windows.map((window) => window.content)).toEqual(['A']);
  });

  it('读出 file_id 与命中行', () => {
    const preview = parseDocumentPreview(
      {
        file_id: 'f-1',
        windows: [{ content: '1\tA', matched_lines: [1, 'x'] }],
      },
      'find',
    );

    expect(preview?.fileId).toBe('f-1');
    expect(preview?.windows[0]!.matchedLines).toEqual([1]);
  });

  it('不是可预览结构时返回 null', () => {
    expect(parseDocumentPreview('not json', 'open')).toBeNull();
    expect(parseDocumentPreview({ other: 1 }, 'open')).toBeNull();
    // 空窗口且顶层没有正文：不是一份文档，交给通用文本渲染
    expect(
      parseDocumentPreview({ windows: [], total_matches: 0 }, 'find'),
    ).toBeNull();
    expect(parseDocumentPreview(null, 'open')).toBeNull();
  });
});

describe('行号与窗口辅助', () => {
  it('行号只在行首「数字 + 制表符」时解析', () => {
    expect(lineNumberOf('12\t正文')).toBe(12);
    expect(lineNumberOf('  7\t正文')).toBe(7);
    expect(lineNumberOf('正文')).toBeNull();
    expect(lineNumberOf('12 正文')).toBeNull();
  });

  it('命中行按行号判定', () => {
    expect(isMatchedLine('3\tA', [3])).toBe(true);
    expect(isMatchedLine('4\tA', [3])).toBe(false);
    expect(isMatchedLine('A', [3])).toBe(false);
  });

  it('窗口标题有行号时带区间，key 稳定', () => {
    const window = { content: '', startLine: 2, endLine: 5, matchedLines: [] };

    expect(windowTitle(window, 0)).toBe('窗口 1: 第 2-5 行');
    expect(windowTitle({ ...window, startLine: 0, endLine: 0 }, 1)).toBe('窗口 2');
    expect(windowKey(window, 0)).toBe('2-5-0');
  });
});

describe('文档预览的结果视图', () => {
  it('可预览结构接管渲染，打开与查找各走各的模式', () => {
    expect(
      buildToolResultView(call('open_kb_document', { content: '1\tA' }))?.kind,
    ).toBe('document-preview');
    expect(
      buildToolResultView(call('find_kb_document', { content: '1\tA' }))?.kind,
    ).toBe('document-preview');
  });

  it('不是可预览结构时不接管', () => {
    expect(buildToolResultView(call('open_kb_document', '纯文本'))).toBeNull();
    expect(buildToolResultView(call('find_kb_document', null))).toBeNull();
  });
});
