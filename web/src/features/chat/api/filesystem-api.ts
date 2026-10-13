/**
 * 面板文件系统端点：对话目录（viewer）与个人空间（workspace）两套。
 *
 * 两套的读、删、搜走同一组函数，靠作用域参数区分；响应没有声明模型，字段按不可信数据处理。
 */
import { unwrap } from '@/shared/api';
import {
  parseDownloadFilename,
  saveBlobAsFile,
  type PreviewFile,
} from '../lib/panel-preview';
import {
  deleteViewerFileRouteApiViewerFilesystemFileDelete,
  deleteWorkspaceFileRouteApiWorkspaceFileDelete,
  downloadViewerApiViewerFilesystemDownloadGet,
  downloadWorkspaceApiWorkspaceDownloadGet,
  getViewerFileApiViewerFilesystemFileGet,
  getViewerTreeApiViewerFilesystemTreeGet,
  getWorkspaceFileApiWorkspaceFileGet,
  getWorkspaceTreeApiWorkspaceTreeGet,
  searchViewerFilesRouteApiViewerFilesystemSearchGet,
  searchWorkspaceFilesRouteApiWorkspaceSearchGet,
} from '@/shared/api/generated/sdk.gen';

/** 两套树的作用域；树模型与 UI 都用这个名字。 */
export type PanelTreeScope = 'thread' | 'workspace';

/** 文件系统里的一个条目。 */
export type FilesystemEntry = {
  /** 接口给的原始路径；目录带尾斜杠，树节点键用它。 */
  path: string;
  name: string;
  isDir: boolean;
  size: number;
  modifiedAt: string;
};

const asText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** 缺 `path` 的条目丢掉——它既不能当节点键也不能预览。 */
export function normalizeEntries(raw: unknown): FilesystemEntry[] {
  const source =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const entries: FilesystemEntry[] = [];

  for (const item of Array.isArray(source.entries) ? source.entries : []) {
    if (typeof item !== 'object' || item === null) continue;

    const entry = item as Record<string, unknown>;
    const path = asText(entry.path);
    if (!path) continue;

    entries.push({
      path,
      name: asText(entry.name),
      isDir: entry.is_dir === true,
      size:
        typeof entry.size === 'number' && Number.isFinite(entry.size) ? entry.size : 0,
      modifiedAt: asText(entry.modified_at),
    });
  }

  return entries;
}

/** 列出一个目录的子项；`path` 省略时是根。 */
export async function listDirectory(input: {
  scope: PanelTreeScope;
  threadId?: string;
  path?: string;
}): Promise<FilesystemEntry[]> {
  const path = input.path ?? '/';

  if (input.scope === 'workspace') {
    return normalizeEntries(
      unwrap<unknown>(await getWorkspaceTreeApiWorkspaceTreeGet({ query: { path } })),
    );
  }

  return normalizeEntries(
    unwrap<unknown>(
      await getViewerTreeApiViewerFilesystemTreeGet({
        query: { thread_id: input.threadId ?? '', path },
      }),
    ),
  );
}

/** 删除一个文件或目录（含子树）。 */
export async function deleteEntry(input: {
  scope: PanelTreeScope;
  threadId?: string;
  path: string;
}): Promise<void> {
  if (input.scope === 'workspace') {
    unwrap<unknown>(
      await deleteWorkspaceFileRouteApiWorkspaceFileDelete({
        query: { path: input.path },
      }),
    );
    return;
  }

  unwrap<unknown>(
    await deleteViewerFileRouteApiViewerFilesystemFileDelete({
      query: { thread_id: input.threadId ?? '', path: input.path },
    }),
  );
}

/** 按关键词搜索；返回可直接定位的条目。 */
export async function searchEntries(input: {
  scope: PanelTreeScope;
  threadId?: string;
  query: string;
}): Promise<FilesystemEntry[]> {
  if (input.scope === 'workspace') {
    return normalizeEntries(
      unwrap<unknown>(
        await searchWorkspaceFilesRouteApiWorkspaceSearchGet({
          query: { query: input.query },
        }),
      ),
    );
  }

  return normalizeEntries(
    unwrap<unknown>(
      await searchViewerFilesRouteApiViewerFilesystemSearchGet({
        query: { thread_id: input.threadId ?? '', query: input.query },
      }),
    ),
  );
}

/**
 * 读一个文件用于预览。
 *
 * 后端对文本与 markdown 返回 JSON（`{content, preview_type, supported, message, truncated, limit}`），
 * 对图片与 PDF 返回二进制流（`X-Ars-Preview-Type` 头带类型）——这与参照的两个归一分支一致。
 * 二进制分支在这里建成对象 URL；回收由预览缓存负责。
 */
export async function fetchFileContent(input: {
  scope: PanelTreeScope;
  threadId?: string;
  path: string;
  name: string;
}): Promise<PreviewFile> {
  const baseFile: PreviewFile = {
    path: input.path,
    name: input.name,
    status: 'ready',
    previewType: 'text',
    supported: true,
    content: null,
    previewUrl: '',
    message: '',
    truncated: false,
  };

  const result =
    input.scope === 'workspace'
      ? await getWorkspaceFileApiWorkspaceFileGet({ query: { path: input.path } })
      : await getViewerFileApiViewerFilesystemFileGet({
          query: { thread_id: input.threadId ?? '', path: input.path },
        });

  // 没拿到原生响应意味着请求层出错（错误已在 result.error 里），按失败处理
  const response = result.response;
  if (!response) throw new Error('文件读取失败');

  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const payload = (result.data ?? {}) as Record<string, unknown>;
    const asText = (value: unknown): string =>
      typeof value === 'string' ? value : '';
    const previewType = asText(
      payload.preview_type ?? payload.previewType ?? payload.kind,
    ) as PreviewFile['previewType'];

    return {
      ...baseFile,
      content: typeof payload.content === 'string' ? payload.content : '',
      previewType: previewType || 'text',
      supported: payload.supported !== false,
      status: payload.supported === false ? 'unsupported' : 'ready',
      message: asText(payload.message),
      truncated: payload.truncated === true,
    };
  }

  const blob = await response.blob();
  const headerType = response.headers.get('x-ars-preview-type');
  const previewType = (headerType as PreviewFile['previewType'] | null) || 'unsupported';

  return {
    ...baseFile,
    content: null,
    previewType,
    supported: previewType !== 'unsupported',
    status: previewType !== 'unsupported' ? 'ready' : 'unsupported',
    message:
      previewType === 'unsupported' ? '当前文件暂不支持预览，请下载后查看' : '',
    previewUrl: window.URL?.createObjectURL ? window.URL.createObjectURL(blob) : '',
  };
}

/**
 * 下载一个文件。
 *
 * 文件名取自 Content-Disposition（中文走 RFC 5987），解析不出时退回条目名字。
 */
export async function downloadFileEntry(input: {
  scope: PanelTreeScope;
  threadId?: string;
  path: string;
  fallbackName: string;
}): Promise<{ ok: boolean; filename: string }> {
  const result =
    input.scope === 'workspace'
      ? await downloadWorkspaceApiWorkspaceDownloadGet({ query: { path: input.path } })
      : await downloadViewerApiViewerFilesystemDownloadGet({
          query: { thread_id: input.threadId ?? '', path: input.path },
        });

  const response = result.response;
  if (!response) return { ok: false, filename: input.fallbackName };

  const disposition =
    response.headers.get('Content-Disposition') ??
    response.headers.get('content-disposition') ??
    '';
  const filename = parseDownloadFilename(disposition) || input.fallbackName;
  const blob = await response.blob();
  const ok = saveBlobAsFile({ blob, filename });

  return { ok, filename };
}
