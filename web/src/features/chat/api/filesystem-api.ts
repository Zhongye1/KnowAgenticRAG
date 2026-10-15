/**
 * 面板文件系统端点：对话目录（viewer）与个人空间（workspace）两套。
 *
 * 两套的读、删、搜走同一组函数，靠作用域参数区分。**个人空间那一侧的事实归 `@/entities/workspace`**
 * （端点、条目归一、预览载荷），这里只把它接到面板的作用域参数上，个人空间页面读的是同一份实现；
 * 对话目录那一侧留在本地，因为它是线程沙箱域，只有面板用。响应没有声明模型，字段按不可信数据处理。
 */
import {
  deleteWorkspaceEntry,
  downloadWorkspaceEntry,
  fetchWorkspaceFile,
  listWorkspaceEntries,
  searchWorkspaceEntries,
} from '@/entities/workspace';
import { unwrap } from '@/shared/api';
import {
  deleteViewerFileRouteApiViewerFilesystemFileDelete,
  downloadViewerApiViewerFilesystemDownloadGet,
  getViewerFileApiViewerFilesystemFileGet,
  getViewerTreeApiViewerFilesystemTreeGet,
  searchViewerFilesRouteApiViewerFilesystemSearchGet,
} from '@/shared/api/generated/sdk.gen';
import { parseDownloadFilename, saveBlobAsFile } from '@/shared/lib/files';
import type { PreviewFile } from '@/shared/lib/files';
import { toFileEntries } from '@/shared/lib/files';
import type { FileEntry } from '@/shared/lib/files';

/** 两套树的作用域；树模型与 UI 都用这个名字。 */
export type PanelTreeScope = 'thread' | 'workspace';

/** 列出一个目录的子项；`path` 省略时是根。 */
export async function listDirectory(input: {
  scope: PanelTreeScope;
  threadId?: string;
  path?: string;
}): Promise<FileEntry[]> {
  const path = input.path ?? '/';

  if (input.scope === 'workspace') {
    return listWorkspaceEntries({ path });
  }

  return toFileEntries(
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
    await deleteWorkspaceEntry({ path: input.path });
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
}): Promise<FileEntry[]> {
  if (input.scope === 'workspace') {
    return searchWorkspaceEntries({ query: input.query });
  }

  return toFileEntries(
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
 * 个人空间那一侧走 `@/entities/workspace`；二进制分支的对象 URL 由预览缓存负责回收。
 */
export async function fetchFileContent(input: {
  scope: PanelTreeScope;
  threadId?: string;
  path: string;
  name: string;
}): Promise<PreviewFile> {
  if (input.scope === 'workspace') {
    return fetchWorkspaceFile({ path: input.path, name: input.name });
  }

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

  const result = await getViewerFileApiViewerFilesystemFileGet({
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
  const previewType =
    (headerType as PreviewFile['previewType'] | null) || 'unsupported';

  return {
    ...baseFile,
    content: null,
    previewType,
    supported: previewType !== 'unsupported',
    status: previewType !== 'unsupported' ? 'ready' : 'unsupported',
    message:
      previewType === 'unsupported' ? '当前文件暂不支持预览，请下载后查看' : '',
    previewUrl: window.URL?.createObjectURL
      ? window.URL.createObjectURL(blob)
      : '',
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
  if (input.scope === 'workspace') {
    return downloadWorkspaceEntry({
      path: input.path,
      fallbackName: input.fallbackName,
    });
  }

  const result = await downloadViewerApiViewerFilesystemDownloadGet({
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
