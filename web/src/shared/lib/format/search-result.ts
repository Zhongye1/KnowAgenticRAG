/**
 * 搜索结果行的共用展示逻辑：片段高亮切片与结果日期。
 *
 * 会话搜索（对话切片）与文件搜索（个人空间切片）都要用同一口径的高亮与日期，因此只有这一处。
 * 时间按固定 +08:00 偏移计算，不引日期库（上海自 1991 年起没有夏令时）。
 */

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 把后端给的 UTC 时间串换算到上海时钟；之后一律用 getUTC* 读取。 */
export const toShanghaiDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getTime() + SHANGHAI_OFFSET_MS);
};

/** 一条片段被切成的高亮段：`match` 为真时用 `<mark>` 渲染。 */
export type SnippetSegment = { text: string; match: boolean };

/**
 * 按查询词切片段，大小写不敏感、纯子串匹配：不分词、不正则、标题不高亮。
 * 空内容或空查询时返回整段非高亮。
 */
export const splitSnippet = (
  content: string,
  query: string,
): SnippetSegment[] => {
  const text = content ?? '';
  const needle = (query ?? '').trim();
  if (!text || !needle) return [{ text, match: false }];

  const lowerText = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const segments: SnippetSegment[] = [];
  let cursor = 0;
  let index = lowerText.indexOf(lowerNeedle);

  while (index >= 0) {
    if (index > cursor) {
      segments.push({ text: text.slice(cursor, index), match: false });
    }
    segments.push({
      text: text.slice(index, index + needle.length),
      match: true,
    });
    cursor = index + needle.length;
    index = lowerText.indexOf(lowerNeedle, cursor);
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), match: false });
  }
  return segments;
};

/** 结果行右侧的日期：当年显示 `M月D日`，跨年显示 `YYYY-MM-DD`。 */
export const formatResultDate = (
  value?: string | null,
  now: Date = new Date(),
): string => {
  const parsed = toShanghaiDate(value);
  if (!parsed) return '';
  const month = parsed.getUTCMonth() + 1;
  const day = parsed.getUTCDate();
  const nowShanghai = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  if (parsed.getUTCFullYear() === nowShanghai.getUTCFullYear()) {
    return `${month}月${day}日`;
  }
  return `${parsed.getUTCFullYear()}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};
