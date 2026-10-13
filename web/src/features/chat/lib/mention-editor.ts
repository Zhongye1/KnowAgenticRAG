/**
 * 提及编辑器的 DOM 与文本互转。
 *
 * 编辑器是 `contenteditable`：普通文字是文本节点，提及是一个带 `data-mention-raw`
 * 的芯片元素，换行是 `<br>`。发出去的是「原始文本」——芯片还原成令牌、`<br>` 还原成
 * 换行，因此后端拿到的东西和用户手打的令牌完全一样。
 *
 * 光标位置也要按同一套换算：DOM 里的偏移与原始文本里的偏移不是一回事（一个芯片在 DOM
 * 里是一个元素，在文本里是一串令牌字符）。
 */

import { getMentionDisplayLabel, parseMentionText } from './mention-text';

/** 芯片上存原始令牌的属性名；`dataset.mentionRaw` 对应 `data-mention-raw`。 */
export const MENTION_RAW_ATTRIBUTE = 'data-mention-raw';

export const isTextNode = (node: Node | null | undefined): node is Text =>
  node?.nodeType === Node.TEXT_NODE;

export const isElementNode = (
  node: Node | null | undefined,
): node is HTMLElement => node?.nodeType === Node.ELEMENT_NODE;

/** 提及芯片：带 `data-mention-raw` 的元素。 */
export const isMentionNode = (
  node: Node | null | undefined,
): node is HTMLElement =>
  isElementNode(node) &&
  (node as HTMLElement).dataset?.mentionRaw !== undefined;

export const isLineBreakNode = (node: Node | null | undefined): boolean =>
  isElementNode(node) && node.tagName === 'BR';

/** 一个节点在原始文本里占多少字符。 */
export function getRawNodeLength(node: Node | null | undefined): number {
  if (!node) return 0;
  if (isTextNode(node)) return node.textContent?.length ?? 0;
  if (isMentionNode(node)) {
    return (node as HTMLElement).dataset.mentionRaw?.length ?? 0;
  }
  if (isLineBreakNode(node)) return 1;

  return Array.from(node.childNodes ?? []).reduce(
    (total, child) => total + getRawNodeLength(child),
    0,
  );
}

/** 把一棵节点树序列化成原始文本。 */
export function serializeEditorNode(node: Node | null | undefined): string {
  if (!node) return '';
  if (isTextNode(node)) return node.textContent ?? '';
  if (isMentionNode(node)) {
    return (node as HTMLElement).dataset.mentionRaw ?? '';
  }
  if (isLineBreakNode(node)) return '\n';

  return Array.from(node.childNodes ?? [])
    .map((child) => serializeEditorNode(child))
    .join('');
}

/** 编辑器当前内容的原始文本；根节点为空时返回空串。 */
export function serializeEditorContent(
  root: Node | null | undefined,
): string {
  return serializeEditorNode(root);
}

/**
 * 某个节点在原始文本里的起始偏移。
 *
 * 做法是逐层往上累加「前面兄弟」的原始长度：文本节点按字符数、芯片按令牌长度、
 * `<br>` 按 1。节点不在编辑器内时返回 `null`，调用方据此放弃换算。
 */
export function getRawOffsetBeforeNode(
  root: Node | null | undefined,
  node: Node | null | undefined,
): number | null {
  if (!root || !node) return null;

  const element = isElementNode(node) ? node : node.parentNode;
  if (!element || (element !== root && !root.contains(element))) return null;

  let offset = 0;
  let current: Node | null = node;
  while (current && current !== root) {
    let sibling = current.previousSibling;
    while (sibling) {
      offset += getRawNodeLength(sibling);
      sibling = sibling.previousSibling;
    }
    current = current.parentNode;
  }

  return current === root ? offset : null;
}

/** 创建一个提及芯片元素；`raw` 是它的令牌文本。 */
export function createMentionChip(
  type: string,
  value: string,
  label: string,
  token: string,
): HTMLElement {
  const chip = document.createElement('span');
  chip.className = 'mention-ref-token';
  chip.setAttribute('data-mention-raw', token);
  chip.setAttribute('data-mention-type', type);
  chip.setAttribute('data-mention-value', value);
  chip.title = token;
  chip.setAttribute('contenteditable', 'false');

  // 芯片带类型图标（参照 .mention-ref-icon）：文件用彩色类型图标，其余用线稿图标；
  // 图标节点由 MentionEditor 挂载后异步填充（React 图标无法直接进 DOM 字符串）
  const icon = document.createElement('span');
  icon.className = 'mention-ref-icon';
  icon.dataset.mentionIcon = type;
  icon.dataset.mentionIconValue = value;
  chip.appendChild(icon);

  const labelSpan = document.createElement('span');
  labelSpan.className = 'mention-ref-label';
  labelSpan.textContent = label;
  chip.appendChild(labelSpan);

  return chip;
}

/**
 * 把原始文本还原成可插入编辑器的片段。
 *
 * 文本里的令牌变成芯片、其余按行拆成文本节点与 `<br>`。芯片显示的是展示名，但它的
 * `data-mention-raw` 保留令牌，因此再序列化回去仍然一致——这是草稿与线程切换能正确
 * 回填的前提。
 */
export function buildEditorFragment(
  value: string,
  displayLabels: Record<string, string> = {},
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const segments = parseMentionText(value);

  for (const segment of segments) {
    if (segment.kind === 'mention') {
      fragment.appendChild(
        createMentionChip(
          segment.type,
          segment.value,
          getMentionDisplayLabel(segment.type, segment.value, displayLabels),
          segment.raw,
        ),
      );
      continue;
    }

    const lines = segment.text.split('\n');
    lines.forEach((line, index) => {
      if (index > 0) fragment.appendChild(document.createElement('br'));
      if (line) fragment.appendChild(document.createTextNode(line));
    });
  }

  return fragment;
}

/**
 * 选区起点在原始文本里的偏移。
 *
 * 文本节点要再加上节点内部的偏移；芯片内部的位置（`offset` 落在它的子节点上）一律按
 * 芯片边界算——芯片不可编辑，光标本就不该停在它中间。
 */
export function getSelectionRawOffset(
  root: Node | null | undefined,
): number | null {
  if (!root) return null;

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  const element = isElementNode(node) ? node : node.parentNode;
  if (!element || (element !== root && !root.contains(element))) return null;

  const base = getRawOffsetBeforeNode(root, node);
  if (base === null) return null;

  if (isTextNode(node)) return base + range.startOffset;

  // 元素内：把前 `startOffset` 个子节点的原始长度加上
  const children = Array.from(node.childNodes).slice(0, range.startOffset);

  return children.reduce((total, child) => total + getRawNodeLength(child), base);
}

/** 把光标放到原始文本的第 `offset` 个字符处；越界会被夹住。 */
export function setSelectionRawOffset(
  root: Node | null | undefined,
  offset: number,
): void {
  if (!root) return;

  const target = Math.max(0, offset);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = target;
  let lastText: Text | null = null;

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    const length = text.textContent?.length ?? 0;
    if (remaining <= length) {
      const range = document.createRange();
      range.setStart(text, remaining);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      return;
    }
    remaining -= length;
    lastText = text;
  }

  // 落在末尾（或编辑器里没有文本节点）：把光标放到最后
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  void lastText;
}
