/**
 * 虚拟路径的纯逻辑。
 *
 * 个人空间与对话目录的路径都是「以 `/` 开头、目录带尾斜杠」的虚拟路径；树、面包屑与
 * 「删的是不是当前预览的祖先」判定在两个切片里都要用，因此比较规则只有这一处。
 */

/**
 * 路径拆成面包屑，每段带回到那一层的路径。
 *
 * 目录段保留尾斜杠（树节点的键就是这个形状），最后一段是文件时不带斜杠；根与空路径返回
 * 空数组——第一段的作用域名由调用方补。同一个函数也用来取祖先键：`map(crumb => crumb.path)`。
 */
export function pathBreadcrumbs(
  path: unknown,
): Array<{ name: string; path: string }> {
  const raw = String(path ?? '').trim();
  if (!raw || raw === '/') return [];

  const parts = raw.split('/').filter(Boolean);
  const isDir = raw.endsWith('/');
  const directoryCount = isDir ? parts.length : parts.length - 1;
  const crumbs: Array<{ name: string; path: string }> = [];

  for (let index = 0; index < directoryCount; index += 1) {
    crumbs.push({
      name: parts[index] as string,
      path: `/${parts.slice(0, index + 1).join('/')}/`,
    });
  }

  if (!isDir) {
    crumbs.push({ name: parts[parts.length - 1] as string, path: raw });
  }

  return crumbs;
}

/** 去掉尾斜杠，用于比较。 */
export const normalizePathKey = (path: unknown): string =>
  String(path ?? '').replace(/\/+$/, '');

/** 两个路径是不是同一层（去尾斜杠后严格相等）。 */
export const isSamePath = (path: unknown, targetPath: unknown): boolean =>
  normalizePathKey(path) === normalizePathKey(targetPath);

/** 两个路径是不是同一个，或者后者在前者的子树里。 */
export function isSameOrChildPath(path: unknown, targetPath: unknown): boolean {
  const normalizedPath = normalizePathKey(path);
  const normalizedTarget = normalizePathKey(targetPath);
  if (!normalizedPath || !normalizedTarget) return false;

  return (
    normalizedPath === normalizedTarget ||
    normalizedPath.startsWith(`${normalizedTarget}/`)
  );
}
