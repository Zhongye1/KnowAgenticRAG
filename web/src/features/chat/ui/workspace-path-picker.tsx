/** 个人空间的目录选择器（只做「选一个目录」）。 */
import * as React from 'react';
import {
  Check,
  ChevronRight,
  Folder,
  FolderPlus,
  RotateCw,
  X,
} from 'lucide-react';

import { Spin } from 'antd';

import { useNotifications } from '@/shared/ui/notifications';

import {
  createWorkspaceDirectory,
  listWorkspaceEntries,
} from '@/entities/workspace';

import styles from './workspace-path-picker.module.css';

/** 面包屑第一段的名字。 */
const ROOT_NAME = 'Workspace';

/** 根路径：能进但不能选。 */
const ROOT_PATH = '/';

/** 归一成 `/{段/段}`；空串与斜杠都落回根。 */
const normalizePath = (path: string): string => {
  const trimmed = String(path ?? '').replace(/^\/+|\/+$/g, '');

  return trimmed ? `/${trimmed}` : ROOT_PATH;
};

type DirectoryEntry = { path: string; name: string };

type WorkspacePathPickerProps = {
  /** 当前选中的目录；空串表示还没选。 */
  value: string;
  /** 面板是否可见；变 true 时按 `value` 定位并加载，变 false 时停止在途请求。 */
  active: boolean;
  disabled?: boolean;
  /** 是否把「还没绑定到项目」的目录也列出来。 */
  includeUnboundProjectDirs?: boolean;
  onChange: (path: string) => void;
};

export const WorkspacePathPicker = ({
  value,
  active,
  disabled = false,
  includeUnboundProjectDirs = false,
  onChange,
}: WorkspacePathPickerProps) => {
  const { addNotification } = useNotifications();
  const [currentPath, setCurrentPath] = React.useState(ROOT_PATH);
  const [entries, setEntries] = React.useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [creatingFolder, setCreatingFolder] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [folderName, setFolderName] = React.useState('');

  const folderNameRef = React.useRef<HTMLInputElement>(null);
  // 请求序号：切目录很快时，迟到的响应不能盖住新目录的列表
  const requestVersionRef = React.useRef(0);

  const selectedDirectory = value ? normalizePath(value) : '';

  const breadcrumbs = React.useMemo(() => {
    const items = [{ name: ROOT_NAME, path: ROOT_PATH }];
    let path = '';

    for (const name of currentPath.split('/').filter(Boolean)) {
      path += `/${name}`;
      items.push({ name, path });
    }

    return items;
  }, [currentPath]);

  const loadEntries = React.useCallback(
    async (path: string) => {
      const version = (requestVersionRef.current += 1);
      const targetPath = normalizePath(path);
      setLoading(true);
      setError('');

      try {
        const listed = await listWorkspaceEntries({
          path: targetPath,
          includeUnboundProjectDirs,
        });
        if (version !== requestVersionRef.current) return;
        setCurrentPath(targetPath);
        setEntries(
          listed
            .filter((entry) => entry.isDir)
            .map((entry) => ({ path: entry.path, name: entry.name })),
        );
      } catch (cause) {
        if (version !== requestVersionRef.current) return;
        setEntries([]);
        setError(cause instanceof Error ? cause.message : '目录加载失败');
      } finally {
        if (version === requestVersionRef.current) setLoading(false);
      }
    },
    [includeUnboundProjectDirs],
  );

  // 面板可见时按当前值定位；收起时只作废在途请求——其余状态由父级按创建会话重新挂载
  // （key）清掉，不在这里同步重置，否则每次收起都要多一轮渲染
  React.useEffect(() => {
    if (!active) {
      requestVersionRef.current += 1;
      return;
    }

    void loadEntries(value || ROOT_PATH);
  }, [active, value, loadEntries]);

  const openDirectory = (path: string) => {
    const targetPath = normalizePath(path);
    // 根目录能进去但选不了：选了它项目就挂在个人空间根上
    onChange(targetPath === ROOT_PATH ? '' : targetPath);
    setCreatingFolder(false);
    setFolderName('');
    void loadEntries(targetPath);
  };

  const startCreatingFolder = () => {
    setFolderName('');
    setCreatingFolder(true);
  };

  const cancelCreatingFolder = () => {
    if (creating) return;
    setCreatingFolder(false);
    setFolderName('');
  };

  // 新建文件夹行出现后把焦点放进去，用户不必再点一次
  React.useEffect(() => {
    if (creatingFolder) folderNameRef.current?.focus();
  }, [creatingFolder]);

  const submitCreateFolder = async () => {
    const name = folderName.trim();
    if (!name || creating) return;

    setCreating(true);
    try {
      const createdPath = await createWorkspaceDirectory({
        parentPath: currentPath,
        name,
      });
      setCreatingFolder(false);
      setFolderName('');
      // 响应没给路径时留在当前目录：至少让用户看到新建的结果
      if (createdPath) {
        openDirectory(createdPath);
      } else {
        await loadEntries(currentPath);
      }
      addNotification({ type: 'success', title: '文件夹', message: '已创建' });
    } catch (cause) {
      addNotification({
        type: 'error',
        title: '文件夹',
        message: cause instanceof Error ? cause.message : '创建失败',
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={styles.picker}>
      <div className={styles.toolbar}>
        <nav className={styles.breadcrumbs} aria-label="Workspace 目录路径">
          {breadcrumbs.map((item) => (
            <button
              key={item.path}
              type="button"
              disabled={disabled || item.path === currentPath}
              onClick={() => openDirectory(item.path)}
            >
              {item.name}
            </button>
          ))}
        </nav>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.textAction}
            disabled={disabled || loading}
            onClick={startCreatingFolder}
          >
            <FolderPlus size={15} className={styles.actionIcon} aria-hidden />
            新建文件夹
          </button>
          <button
            type="button"
            className={styles.iconAction}
            aria-label="刷新目录"
            disabled={disabled || loading}
            onClick={() => void loadEntries(currentPath)}
          >
            <RotateCw size={15} className={styles.actionIcon} aria-hidden />
          </button>
        </div>
      </div>

      {creatingFolder ? (
        <form
          className={styles.createRow}
          onSubmit={(event) => {
            event.preventDefault();
            void submitCreateFolder();
          }}
        >
          <FolderPlus size={16} className={styles.createRowIcon} aria-hidden />
          <input
            ref={folderNameRef}
            value={folderName}
            maxLength={255}
            placeholder="文件夹名称"
            aria-label="文件夹名称"
            disabled={creating}
            onChange={(event) => setFolderName(event.target.value)}
          />
          <button
            type="submit"
            className={styles.createSubmit}
            disabled={!folderName.trim() || creating}
          >
            {creating ? '创建中' : '创建'}
          </button>
          <button
            type="button"
            className={styles.iconAction}
            aria-label="取消新建文件夹"
            disabled={creating}
            onClick={cancelCreatingFolder}
          >
            <X size={15} className={styles.actionIcon} aria-hidden />
          </button>
        </form>
      ) : null}

      <div className={styles.selection} aria-live="polite">
        {selectedDirectory ? (
          <Check size={14} className={styles.selectionIcon} aria-hidden />
        ) : null}
        <span title={selectedDirectory || undefined}>
          {selectedDirectory || '请选择项目目录'}
        </span>
      </div>

      <div className={`${styles.list} ${loading ? styles.listLoading : ''}`}>
        {loading ? (
          <Spin aria-hidden />
        ) : entries.length > 0 ? (
          entries.map((entry) => {
            const selected = selectedDirectory === normalizePath(entry.path);
            return (
              <button
                key={entry.path}
                type="button"
                className={`${styles.row} ${selected ? styles.rowSelected : ''}`}
                disabled={disabled}
                onClick={() => openDirectory(entry.path)}
              >
                <Folder size={16} className={styles.rowIcon} aria-hidden />
                <span title={entry.path}>{entry.name}</span>
                {selected ? (
                  <Check size={15} className={styles.rowCheck} aria-hidden />
                ) : (
                  <ChevronRight
                    size={15}
                    className={styles.rowChevron}
                    aria-hidden
                  />
                )}
              </button>
            );
          })
        ) : (
          <div
            className={error ? styles.emptyError : styles.empty}
            role={error ? 'alert' : 'status'}
          >
            {error || '当前目录为空'}
          </div>
        )}
      </div>
    </div>
  );
};
