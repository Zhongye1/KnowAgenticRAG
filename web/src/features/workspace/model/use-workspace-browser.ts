/** 个人空间页面的控制器。 */
import * as React from 'react';

import {
  MAX_UPLOAD_FILE_COUNT,
  fetchWorkspaceFile,
  downloadWorkspaceEntry,
  useCreateWorkspaceDirectory,
  useDeleteWorkspaceEntry,
  useSaveWorkspaceFile,
  useUploadWorkspaceFiles,
  useWorkspaceEntries,
} from '@/entities/workspace';
import { describeFailure } from '@/shared/api';
import type { PreviewFile } from '@/shared/lib/files';
import type { FileEntry } from '@/shared/lib/files';
import { isSameOrChildPath } from '@/shared/lib/files';

import { isEditableWorkspaceFile } from '../lib/file-format';
import {
  buildWorkspaceRows,
  pruneSelection,
  workspaceBreadcrumbs,
} from '../lib/workspace-view';
import type { WorkspaceRow } from '../lib/workspace-view';

/** 预览的四种状态；`idle` 表示没有打开的预览。 */
export type WorkspacePreview = {
  entry: FileEntry | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  file: PreviewFile | null;
  /** 编辑缓冲；未进入编辑时等于文件内容。 */
  draft: string;
  editing: boolean;
  dirty: boolean;
  /** 能不能编辑：可编辑后缀 + 内容没有被服务端截短。 */
  canEdit: boolean;
};

const IDLE_PREVIEW: WorkspacePreview = {
  entry: null,
  status: 'idle',
  file: null,
  draft: '',
  editing: false,
  dirty: false,
  canEdit: false,
};

export type WorkspaceBrowserInput = {
  /** 成功文案。 */
  notifySuccess: (message: string) => void;
  /** 失败与拦截文案（超量上传、只读、空文件夹名）。 */
  notifyError: (message: string) => void;
};

export type WorkspaceBrowser = {
  /** 当前目录；`/` 是个人空间根。 */
  currentPath: string;
  entries: FileEntry[];
  rows: WorkspaceRow[];
  breadcrumbs: Array<{ name: string; path: string }>;
  isLoading: boolean;
  /** 打开一个目录或快速访问项。 */
  openDirectory: (path: string) => void;
  /** 打开一个条目：目录进入、文件预览。 */
  openEntry: (entry: FileEntry) => void;

  selectionMode: boolean;
  selectedPaths: string[];
  setSelectionMode: (next: boolean) => void;
  toggleSelection: (path: string) => void;

  preview: WorkspacePreview;
  closePreview: () => void;
  startEditing: () => void;
  cancelEditing: () => void;
  changeDraft: (value: string) => void;
  savePreview: () => Promise<void>;

  uploading: boolean;
  creatingDirectory: boolean;
  saving: boolean;
  deletingPaths: string[];
  uploadFiles: (files: File[]) => Promise<void>;
  /** 新建目录；成功返回 true（弹窗据此关闭）。 */
  createDirectory: (name: string) => Promise<boolean>;
  /** 删除给定条目；确认由渲染层负责。 */
  deleteEntries: (targets: FileEntry[]) => Promise<void>;
  download: (entry: FileEntry) => Promise<void>;
};

/** 预览进入加载态时的占位文件；状态层与渲染层共用它，避免两处各拼一次。 */
const loadingPreviewFile = (
  entry: FileEntry,
  previous: PreviewFile | null,
): PreviewFile => ({
  path: entry.path,
  name: entry.name,
  status: 'loading',
  previewType: previous?.previewType ?? 'text',
  supported: true,
  content: null,
  previewUrl: '',
  message: '',
  truncated: false,
});

const canEditFile = (entry: FileEntry, file: PreviewFile | null): boolean =>
  Boolean(
    file &&
    file.status === 'ready' &&
    !file.truncated &&
    !entry.isDir &&
    isEditableWorkspaceFile(entry.path),
  );

export function useWorkspaceBrowser(
  input: WorkspaceBrowserInput,
): WorkspaceBrowser {
  const { notifySuccess, notifyError } = input;

  const [currentPath, setCurrentPath] = React.useState('/');
  const listing = useWorkspaceEntries(currentPath);
  const entries = listing.entries;

  const [selectionMode, setSelectionMode] = React.useState(false);
  const [selectedPaths, setSelectedPaths] = React.useState<string[]>([]);
  const [preview, setPreview] = React.useState<WorkspacePreview>(IDLE_PREVIEW);
  const [deletingPaths, setDeletingPaths] = React.useState<string[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [creatingDirectory, setCreatingDirectory] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const createDirectoryMutation = useCreateWorkspaceDirectory();
  const deleteMutation = useDeleteWorkspaceEntry();
  const uploadMutation = useUploadWorkspaceFiles();
  const saveMutation = useSaveWorkspaceFile();

  // 每次预览请求一个序号：迟到的响应不能盖掉用户已经切到的新文件
  const previewRequestRef = React.useRef(0);
  const previewRef = React.useRef<WorkspacePreview>(IDLE_PREVIEW);
  React.useEffect(() => {
    previewRef.current = preview;
  }, [preview]);

  const rows = React.useMemo(() => buildWorkspaceRows(entries), [entries]);

  // 选中集在渲染期按当前目录派生：列表换过之后，消失的路径不能继续出现在「删除选中」里
  const visibleSelectedPaths = React.useMemo(
    () => pruneSelection(selectedPaths, entries),
    [entries, selectedPaths],
  );

  // 每次失败只报一次：RQ 重渲染不会重复弹同一条
  const reportedErrorRef = React.useRef<unknown>(null);
  React.useEffect(() => {
    if (!listing.error || reportedErrorRef.current === listing.error) return;
    reportedErrorRef.current = listing.error;
    notifyError(describeFailure(listing.error, '加载个人空间目录失败'));
  }, [listing.error, notifyError]);

  const revokePreviewUrl = React.useCallback((file: PreviewFile | null) => {
    if (file?.previewUrl && window.URL?.revokeObjectURL) {
      window.URL.revokeObjectURL(file.previewUrl);
    }
  }, []);

  const closePreview = React.useCallback(() => {
    previewRequestRef.current += 1;
    revokePreviewUrl(previewRef.current.file);
    setPreview(IDLE_PREVIEW);
  }, [revokePreviewUrl]);

  const openDirectory = React.useCallback(
    (path: string) => {
      setCurrentPath(path);
      setSelectionMode(false);
      setSelectedPaths([]);
      closePreview();
    },
    [closePreview],
  );

  const openPreview = React.useCallback(
    async (entry: FileEntry) => {
      const requestId = (previewRequestRef.current += 1);
      revokePreviewUrl(previewRef.current.file);
      setPreview({
        entry,
        status: 'loading',
        file: loadingPreviewFile(entry, previewRef.current.file),
        draft: '',
        editing: false,
        dirty: false,
        canEdit: false,
      });

      try {
        const file = await fetchWorkspaceFile({
          path: entry.path,
          name: entry.name,
        });
        if (previewRequestRef.current !== requestId) {
          // 请求已过期：它带回来的对象 URL 必须就地回收，否则泄漏
          revokePreviewUrl(file);
          return;
        }

        setPreview({
          entry,
          status: 'ready',
          file,
          draft: file.content ?? '',
          editing: false,
          dirty: false,
          canEdit: canEditFile(entry, file),
        });
      } catch (error) {
        if (previewRequestRef.current !== requestId) return;
        notifyError(describeFailure(error, '加载文件预览失败'));
        setPreview({
          entry,
          status: 'error',
          file: null,
          draft: '',
          editing: false,
          dirty: false,
          canEdit: false,
        });
      }
    },
    [notifyError, revokePreviewUrl],
  );

  const openEntry = React.useCallback(
    (entry: FileEntry) => {
      if (entry.isDir) {
        openDirectory(entry.path);
        return;
      }

      void openPreview(entry);
    },
    [openDirectory, openPreview],
  );

  const startEditing = React.useCallback(() => {
    setPreview((current) =>
      current.canEdit ? { ...current, editing: true } : current,
    );
  }, []);

  const cancelEditing = React.useCallback(() => {
    setPreview((current) => ({
      ...current,
      editing: false,
      dirty: false,
      draft: current.file?.content ?? '',
    }));
  }, []);

  const changeDraft = React.useCallback((value: string) => {
    setPreview((current) => ({
      ...current,
      draft: value,
      dirty: value !== (current.file?.content ?? ''),
    }));
  }, []);

  const savePreview = React.useCallback(async () => {
    const current = previewRef.current;
    const entry = current.entry;
    // 无改动不发请求
    if (!entry || current.status !== 'ready' || !current.dirty || saving)
      return;

    setSaving(true);
    try {
      const saved = await saveMutation.mutateAsync({
        path: entry.path,
        content: current.draft,
      });
      setPreview((state) => ({
        ...state,
        entry: saved ?? state.entry,
        file: state.file
          ? {
              ...state.file,
              content: state.draft,
              truncated: false,
              name: saved?.name || state.file.name,
            }
          : state.file,
        editing: false,
        dirty: false,
      }));
      notifySuccess('文件保存成功');
    } catch (error) {
      notifyError(describeFailure(error, '文件保存失败'));
    } finally {
      setSaving(false);
    }
  }, [notifyError, notifySuccess, saveMutation, saving]);

  const uploadFiles = React.useCallback(
    async (files: File[]) => {
      const list = Array.from(files);
      if (!list.length || uploading) return;

      if (list.length > MAX_UPLOAD_FILE_COUNT) {
        notifyError(`一次最多上传 ${MAX_UPLOAD_FILE_COUNT} 个文件`);
        return;
      }

      setUploading(true);
      try {
        await uploadMutation.mutateAsync({
          parentPath: currentPath,
          files: list,
        });
        notifySuccess(`${list.length} 个文件上传成功`);
      } catch (error) {
        notifyError(describeFailure(error, '上传文件失败'));
      } finally {
        setUploading(false);
      }
    },
    [currentPath, notifyError, notifySuccess, uploadMutation, uploading],
  );

  const createDirectory = React.useCallback(
    async (rawName: string) => {
      const name = rawName.trim();
      if (!name) {
        notifyError('请输入文件夹名');
        return false;
      }
      if (creatingDirectory) return false;

      setCreatingDirectory(true);
      try {
        await createDirectoryMutation.mutateAsync({
          parentPath: currentPath,
          name,
        });
        notifySuccess('文件夹创建成功');
        return true;
      } catch (error) {
        notifyError(describeFailure(error, '创建文件夹失败'));
        return false;
      } finally {
        setCreatingDirectory(false);
      }
    },
    [
      createDirectoryMutation,
      creatingDirectory,
      currentPath,
      notifyError,
      notifySuccess,
    ],
  );

  const deleteEntries = React.useCallback(
    async (targets: FileEntry[]) => {
      const paths = targets
        .filter((entry) => Boolean(entry?.path))
        .map((entry) => entry.path);
      if (!paths.length) return;

      // 合并而不是覆盖：批量删除与行内删除可能同时在飞，覆盖会让另一边的转动反馈提前消失
      setDeletingPaths((current) => [...new Set([...current, ...paths])]);
      try {
        await Promise.all(
          paths.map((path) => deleteMutation.mutateAsync({ path })),
        );
        // 删掉的正是当前预览（或它的祖先）时预览必须关掉，否则会继续展示已经不存在的文件。
        // 预览路径在删除**之后**才读：删除期间用户可能已经切到别的文件，判定必须用最新的那一个。
        const previewedPath = previewRef.current.entry?.path;
        if (
          previewedPath &&
          paths.some((path) => isSameOrChildPath(previewedPath, path))
        ) {
          closePreview();
        }
        setSelectedPaths((current) =>
          current.filter((path) => !paths.includes(path)),
        );
        notifySuccess(paths.length > 1 ? '选中项删除成功' : '删除成功');
      } catch (error) {
        notifyError(describeFailure(error, '删除失败'));
      } finally {
        setDeletingPaths((current) =>
          current.filter((path) => !paths.includes(path)),
        );
      }
    },
    [closePreview, deleteMutation, notifyError, notifySuccess],
  );

  const download = React.useCallback(
    async (entry: FileEntry) => {
      if (entry.isDir) return;
      try {
        const result = await downloadWorkspaceEntry({
          path: entry.path,
          fallbackName: entry.name,
        });
        if (!result.ok) notifyError('下载文件失败');
      } catch (error) {
        notifyError(describeFailure(error, '下载文件失败'));
      }
    },
    [notifyError],
  );

  return {
    currentPath,
    entries,
    rows,
    breadcrumbs: workspaceBreadcrumbs(currentPath),
    isLoading: listing.isLoading,
    openDirectory,
    openEntry,

    selectionMode,
    selectedPaths: visibleSelectedPaths,
    setSelectionMode: (next: boolean) => {
      setSelectionMode(next);
      if (!next) setSelectedPaths([]);
    },
    toggleSelection: (path: string) => {
      setSelectedPaths((current) =>
        current.includes(path)
          ? current.filter((item) => item !== path)
          : [...current, path],
      );
    },

    preview,
    closePreview,
    startEditing,
    cancelEditing,
    changeDraft,
    savePreview,

    uploading,
    creatingDirectory,
    saving,
    deletingPaths,
    uploadFiles,
    createDirectory,
    deleteEntries,
    download,
  };
}
