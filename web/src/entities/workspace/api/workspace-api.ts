/**
 * 个人空间端点。
 *
 * 只走契约生成的 SDK。**响应在契约里都没有声明模型**（200 是空 schema 或直接是二进制流），因此
 * 条目按不可信 wire 数据归一（`@/shared/lib/filesystem-entry`），预览载荷按 `@/shared/lib/file-preview`
 * 的形状产出。对话页面板与个人空间页面共用这一份，不再各写一份。
 */
import { unwrap } from '@/shared/api';
import {
  createWorkspaceDirectoryRouteApiWorkspaceDirectoryPost,
  deleteWorkspaceFileRouteApiWorkspaceFileDelete,
  downloadWorkspaceApiWorkspaceDownloadGet,
  getWorkspaceFileApiWorkspaceFileGet,
  getWorkspaceTreeApiWorkspaceTreeGet,
  searchWorkspaceFilesRouteApiWorkspaceSearchGet,
  updateWorkspaceFileApiWorkspaceFilePut,
  uploadWorkspaceFilesRouteApiWorkspaceUploadPost,
} from '@/shared/api/generated/sdk.gen';
import {
  parseDownloadFilename,
  saveBlobAsFile,
} from '@/shared/lib/files';
import type { PreviewFile } from '@/shared/lib/files';
import { toFileEntries, toFileEntry } from '@/shared/lib/files';
import type { FileEntry } from '@/shared/lib/files';

/** 单次上传的文件数上限；与后端 `workspace_service` 的 400 条件一致。 */
export const MAX_UPLOAD_FILE_COUNT = 50;

const NOT_PREVIEWABLE_TEXT = '当前文件暂不支持预览，请下载后查看';

/**
 * 列出一个目录的子项；`path` 省略时是根。
 *
 * `includeUnboundProjectDirs` 打开后连「还没绑定到项目的目录」一起列出来——项目选目录时要用，
 * 否则刚建好、还没绑项目的目录在选择界面里看不到。
 */
export async function listWorkspaceEntries(input: {
  path?: string;
  includeUnboundProjectDirs?: boolean;
}): Promise<FileEntry[]> {
  return toFileEntries(
    unwrap<unknown>(
      await getWorkspaceTreeApiWorkspaceTreeGet({
        query: {
          path: input.path ?? '/',
          include_unbound_project_dirs: input.includeUnboundProjectDirs,
        },
      }),
    ),
  );
}

/** 按关键词搜索个人空间下的文件；服务端只回文件，不回目录。 */
export async function searchWorkspaceEntries(input: {
  query: string;
}): Promise<FileEntry[]> {
  return toFileEntries(
    unwrap<unknown>(
      await searchWorkspaceFilesRouteApiWorkspaceSearchGet({
        query: { query: input.query },
      }),
    ),
  );
}

/**
 * 读一个文件用于预览。
 *
 * 后端对文本与 markdown 返回 JSON（`{content, preview_type, supported, message, truncated, limit}`），
 * 对图片与 PDF 返回二进制流（`X-Ars-Preview-Type` 头带类型）。二进制分支在这里建成对象 URL；
 * 回收由调用方负责。
 */
export async function fetchWorkspaceFile(input: {
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

  const result = await getWorkspaceFileApiWorkspaceFileGet({
    query: { path: input.path },
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
    message: previewType === 'unsupported' ? NOT_PREVIEWABLE_TEXT : '',
    previewUrl: window.URL?.createObjectURL
      ? window.URL.createObjectURL(blob)
      : '',
  };
}

/**
 * 保存一个文本文件的内容；返回服务端归一后的条目（响应里没有条目时为 null）。
 *
 * 可写的后缀由后端决定（`.md / .markdown / .mdx / .txt`），前端不预处理。
 */
export async function saveWorkspaceFile(input: {
  path: string;
  content: string;
}): Promise<FileEntry | null> {
  const response = unwrap<unknown>(
    await updateWorkspaceFileApiWorkspaceFilePut({
      body: { path: input.path, content: input.content },
    }),
  );
  const entry =
    typeof response === 'object' && response !== null
      ? (response as Record<string, unknown>).entry
      : null;

  return toFileEntry(entry);
}

/** 在个人空间下新建目录；返回新目录的路径，响应里没有路径时返回空串。 */
export async function createWorkspaceDirectory(input: {
  parentPath: string;
  name: string;
}): Promise<string> {
  const response = unwrap<unknown>(
    await createWorkspaceDirectoryRouteApiWorkspaceDirectoryPost({
      body: { parent_path: input.parentPath, name: input.name },
    }),
  );
  const entry =
    typeof response === 'object' && response !== null
      ? (response as Record<string, unknown>).entry
      : null;

  return toFileEntry(entry)?.path ?? '';
}

/** 删除一个文件或目录（目录含整棵子树）。 */
export async function deleteWorkspaceEntry(input: {
  path: string;
}): Promise<void> {
  unwrap<unknown>(
    await deleteWorkspaceFileRouteApiWorkspaceFileDelete({
      query: { path: input.path },
    }),
  );
}

/** 上传文件到一个目录；返回服务端写入的条目。 */
export async function uploadWorkspaceFiles(input: {
  parentPath: string;
  files: File[];
}): Promise<FileEntry[]> {
  return toFileEntries(
    unwrap<unknown>(
      await uploadWorkspaceFilesRouteApiWorkspaceUploadPost({
        body: { parent_path: input.parentPath, files: input.files },
      }),
    ),
  );
}

/**
 * 下载一个文件。
 *
 * 文件名取自 Content-Disposition（中文走 RFC 5987），解析不出时退回条目名字。
 */
export async function downloadWorkspaceEntry(input: {
  path: string;
  fallbackName: string;
}): Promise<{ ok: boolean; filename: string }> {
  const result = await downloadWorkspaceApiWorkspaceDownloadGet({
    query: { path: input.path },
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
