/**
 * 交付物端点：下载与保存到个人空间。
 *
 * 响应形状复用生成物：预览是 `ThreadArtifactPreviewResponse`，保存是
 * `SaveThreadArtifactResponse`（含 `saved_path`）。
 */
import { unwrap } from '@/shared/api';
import {
  getThreadArtifactApiChatThreadThreadIdArtifactsPathGet,
  saveThreadArtifactToWorkspaceApiChatThreadThreadIdArtifactsSavePost,
} from '@/shared/api/generated/sdk.gen';

import { parseDownloadFilename, saveBlobAsFile } from '@/shared/lib/files';

/** 下载一个交付物；文件名优先取 Content-Disposition（中文走 RFC 5987）。 */
export async function downloadThreadArtifact(input: {
  threadId: string;
  path: string;
  fallbackName: string;
}): Promise<{ ok: boolean; filename: string }> {
  const result = await getThreadArtifactApiChatThreadThreadIdArtifactsPathGet({
    path: { thread_id: input.threadId, path: input.path },
    parseAs: 'blob',
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

/** 保存一个交付物到个人空间目录；目标目录为空时由后端用默认值。 */
export async function saveThreadArtifact(input: {
  threadId: string;
  path: string;
  destinationPath?: string;
}): Promise<{ savedPath: string }> {
  const response = unwrap<{ saved_path?: unknown }>(
    await saveThreadArtifactToWorkspaceApiChatThreadThreadIdArtifactsSavePost({
      path: { thread_id: input.threadId },
      body: {
        path: input.path,
        destination_path: input.destinationPath ?? null,
      },
    }),
  );

  if (typeof response?.saved_path !== 'string' || !response.saved_path) {
    throw new Error('保存接口没有返回保存路径');
  }
  return { savedPath: response.saved_path };
}
