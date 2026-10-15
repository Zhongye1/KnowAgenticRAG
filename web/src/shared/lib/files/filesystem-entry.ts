/**
 * 文件系统条目的形状与归一。
 *
 * 个人空间与对话目录两个目录列表端点下发同一形状的条目，两个切片都要读它，因此归一只有这一处。
 * 响应没有声明模型，字段按不可信数据处理。
 */

/** 文件系统里的一个条目。 */
export type FileEntry = {
  /** 接口给的原始路径；目录带尾斜杠，树节点键与面包屑都用它。 */
  path: string;
  name: string;
  isDir: boolean;
  size: number;
  /** 服务端下发的 UTC ISO 时间串；解析失败时为空串。 */
  modifiedAt: string;
};

const asText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/** 归一单个条目；缺 `path` 时返回 null——它既不能当节点键也不能预览。 */
export function toFileEntry(raw: unknown): FileEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;

  const entry = raw as Record<string, unknown>;
  const path = asText(entry.path);
  if (!path) return null;

  return {
    path,
    name: asText(entry.name),
    isDir: entry.is_dir === true,
    size:
      typeof entry.size === 'number' && Number.isFinite(entry.size)
        ? entry.size
        : 0,
    modifiedAt: asText(entry.modified_at),
  };
}

/** 列表响应里的条目；缺 `path` 的条目丢掉。 */
export function toFileEntries(raw: unknown): FileEntry[] {
  const source =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const entries: FileEntry[] = [];

  for (const item of Array.isArray(source.entries) ? source.entries : []) {
    const entry = toFileEntry(item);
    if (entry) entries.push(entry);
  }

  return entries;
}
