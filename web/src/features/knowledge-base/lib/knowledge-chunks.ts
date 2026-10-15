/**
 * 分块的合并规则。
 *
 * 分块之间常有重叠，合并时去掉重复部分；被前面内容完全覆盖的分块不再单独列出。详情弹窗的
 * 「解析结果」在服务端没给 Markdown 时用它兜底，「分块」视图展示的也是合并后的列表。
 */

/** 参与合并的最小字段；行上的其余字段原样透出。 */
export type ChunkRecord = {
  id: string;
  content: string;
  chunk_order_index: number;
};

export type MergedChunk<T extends ChunkRecord = ChunkRecord> = T & {
  startOffset: number;
  endOffset: number;
};

/** 两个字符串的最长重叠：从最短 11 个字符开始找，太短的重叠不当作重复。 */
export const findOverlap = (left: string, right: string): string => {
  if (!left || !right) return '';
  const maxOverlap = Math.min(left.length, right.length);
  for (let size = maxOverlap; size > 10; size -= 1) {
    const endOfLeft = left.slice(-size);
    if (endOfLeft === right.slice(0, size)) return endOfLeft;
  }
  return '';
};

/** 按 `chunk_order_index` 排序后合并，返回合并文本与被覆盖到的分块。 */
export const mergeChunks = <T extends ChunkRecord>(
  chunks?: T[] | null,
): { content: string; chunks: MergedChunk<T>[] } => {
  if (!chunks || chunks.length === 0) return { content: '', chunks: [] };

  const sorted = [...chunks].sort(
    (left, right) => left.chunk_order_index - right.chunk_order_index,
  );
  const merged: MergedChunk<T>[] = [];
  let currentContent = '';

  sorted.forEach((chunk, index) => {
    const content = chunk.content;
    if (index === 0) {
      currentContent = content;
      merged.push({ ...chunk, startOffset: 0, endOffset: content.length });
      return;
    }

    const overlap = findOverlap(currentContent, content);
    const remainder = content.slice(overlap.length);
    // 完全被前面的内容覆盖的分块不重复列出
    if (remainder.length === 0) return;

    const startOffset = currentContent.length;
    currentContent += overlap.length > 0 ? remainder : `\n${remainder}`;
    merged.push({ ...chunk, startOffset, endOffset: currentContent.length });
  });

  return { content: currentContent, chunks: merged };
};
