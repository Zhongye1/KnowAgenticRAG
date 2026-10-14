import { describe, expect, it } from 'vitest';

import {
  buildEditorFragment,
  createMentionChip,
  getRawNodeLength,
  getRawOffsetBeforeNode,
  isLineBreakNode,
  isMentionNode,
  isTextNode,
  serializeEditorContent,
} from '@/features/chat/lib/mention-editor';

/** 造一个与编辑器同构的 DOM：文本节点 + 芯片 + <br>。 */
const buildEditor = (html: string): HTMLElement => {
  const editor = document.createElement('div');
  editor.innerHTML = html;

  return editor;
};

const chip = (token: string): string =>
  `<span data-mention-raw="${token}">显示名</span>`;

describe('节点判定', () => {
  it('识别文本、换行与提及芯片', () => {
    const editor = buildEditor(`a<br>${chip('@file:a.md')}`);

    expect(isTextNode(editor.childNodes[0]!)).toBe(true);
    expect(isLineBreakNode(editor.childNodes[1]!)).toBe(true);
    expect(isMentionNode(editor.childNodes[2]!)).toBe(true);
    expect(isMentionNode(editor.childNodes[0]!)).toBe(false);
  });
});

describe('getRawNodeLength', () => {
  it('文本按字符数、芯片按令牌长度、换行按 1', () => {
    expect(getRawNodeLength(document.createTextNode('你好'))).toBe(2);

    const editor = buildEditor(`<br>${chip('@file:a.md')}`);
    expect(getRawNodeLength(editor.childNodes[0]!)).toBe(1);
    expect(getRawNodeLength(editor.childNodes[1]!)).toBe(10);
  });

  it('元素按子节点累加，空节点为 0', () => {
    expect(getRawNodeLength(buildEditor(`a<br>${chip('@x:y')}`))).toBe(
      1 + 1 + 4,
    );
    expect(getRawNodeLength(null)).toBe(0);
  });
});

describe('serializeEditorContent', () => {
  it('芯片还原成令牌，换行还原成 \\n', () => {
    expect(
      serializeEditorContent(buildEditor(`看 ${chip('@file:a.md')}<br>然后`)),
    ).toBe('看 @file:a.md\n然后');
  });

  it('嵌套元素也能展开', () => {
    expect(
      serializeEditorContent(buildEditor(`<b>粗</b>${chip('@x:y')}`)),
    ).toBe('粗@x:y');
  });

  it('空编辑器与空节点返回空串', () => {
    expect(serializeEditorContent(buildEditor(''))).toBe('');
    expect(serializeEditorContent(null)).toBe('');
  });
});

describe('getRawOffsetBeforeNode', () => {
  it('累加前面兄弟的原始长度', () => {
    const editor = buildEditor(`ab${chip('@file:a.md')}cd`);
    const textNode = editor.childNodes[2]!;

    expect(getRawOffsetBeforeNode(editor, textNode)).toBe(12);
  });

  it('嵌套节点的偏移也按层累加', () => {
    const editor = buildEditor(`ab<b>${chip('@x:y')}尾</b>`);
    const inner = editor.childNodes[1]!.firstChild!;

    expect(getRawOffsetBeforeNode(editor, inner)).toBe(2);
  });

  it('节点不在编辑器内时返回 null', () => {
    const editor = buildEditor('a');
    const outside = document.createElement('span');

    expect(getRawOffsetBeforeNode(editor, outside)).toBeNull();
    expect(getRawOffsetBeforeNode(null, outside)).toBeNull();
  });
});

describe('createMentionChip', () => {
  it('令牌写进属性，展示名写在 label 节点里，且不可编辑', () => {
    const chip = createMentionChip('file', 'a.md', '报表.pdf', '@file:a.md');

    expect(chip.getAttribute('data-mention-raw')).toBe('@file:a.md');
    expect(chip.getAttribute('data-mention-type')).toBe('file');
    expect(chip.getAttribute('data-mention-value')).toBe('a.md');
    expect(chip.getAttribute('contenteditable')).toBe('false');
    // 展示名在 .mention-ref-label；芯片本体含图标节点，textContent 会带上
    expect(chip.querySelector('.mention-ref-label')!.textContent).toBe(
      '报表.pdf',
    );
    expect(chip.querySelector('.mention-ref-icon')).toBeTruthy();
    expect(isMentionNode(chip)).toBe(true);
  });
});

describe('buildEditorFragment', () => {
  const mount = (fragment: DocumentFragment): HTMLElement => {
    const host = document.createElement('div');
    host.appendChild(fragment);

    return host;
  };

  it('令牌变成芯片，其余是文本节点', () => {
    const host = mount(buildEditorFragment('看 @file:a.md 这个'));

    expect(host.childNodes).toHaveLength(3);
    expect(isTextNode(host.childNodes[0]!)).toBe(true);
    expect(isMentionNode(host.childNodes[1]!)).toBe(true);
    expect(isTextNode(host.childNodes[2]!)).toBe(true);
  });

  it('换行变成 <br>', () => {
    const host = mount(buildEditorFragment('第一行\n第二行'));

    expect(host.childNodes).toHaveLength(3);
    expect(isLineBreakNode(host.childNodes[1]!)).toBe(true);
  });

  it('芯片显示展示名，映射表优先', () => {
    const host = mount(
      buildEditorFragment('@file:/a/报表.pdf', {
        'file:/a/报表.pdf': '报表.pdf',
      }),
    );

    expect(
      host.querySelector('[data-mention-raw] .mention-ref-label')!.textContent,
    ).toBe('报表.pdf');
  });

  it('没有映射时文件退到路径最后一段', () => {
    const host = mount(buildEditorFragment('@file:/a/b/c.md'));

    expect(
      host.querySelector('[data-mention-raw] .mention-ref-label')!.textContent,
    ).toBe('c.md');
  });

  it('构建后再序列化能还原原文（草稿回填的前提）', () => {
    const value = '看 @file:a.md\n还有 @skill:"带 空格" 结尾';

    expect(serializeEditorContent(mount(buildEditorFragment(value)))).toBe(
      value,
    );
  });

  it('空文本得到空片段', () => {
    expect(mount(buildEditorFragment('')).childNodes).toHaveLength(0);
  });
});
