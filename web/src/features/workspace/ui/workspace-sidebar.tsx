/** 个人空间侧栏。 */
import * as React from 'react';
import { ChevronDown, FolderPlus, Loader2, Search, Upload } from 'lucide-react';

import { QUICK_ACCESS, isQuickAccessPath } from '../lib/workspace-view';
import { isSamePath, normalizePathKey } from '@/shared/lib/files';
import { resolveFileIconUrl } from '@/shared/lib/files';

import styles from './workspace-sidebar.module.css';

type WorkspaceSidebarProps = {
  currentPath: string;
  uploading: boolean;
  onUploadRequest: () => void;
  onCreateDirectory: () => void;
  onSelectRoot: () => void;
  onSelectPath: (path: string) => void;
  onOpenSearch: () => void;
};

export const WorkspaceSidebar = ({
  currentPath,
  uploading,
  onUploadRequest,
  onCreateDirectory,
  onSelectRoot,
  onSelectPath,
  onOpenSearch,
}: WorkspaceSidebarProps) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  // 点外面收起菜单；用 pointerdown
  React.useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  const atRoot =
    !isQuickAccessPath(currentPath) && normalizePathKey(currentPath) === '';

  return (
    <aside className={styles.sidebar}>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.actionBtn}
          aria-label="搜索"
          onClick={onOpenSearch}
        >
          <Search size={16} aria-hidden />
          <span>搜索</span>
        </button>

        <div className={styles.dropdown} ref={menuRef}>
          <button
            type="button"
            className={styles.actionBtn}
            disabled={uploading}
            title="上传文件"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => {
              if (uploading) return;
              setMenuOpen((open) => !open);
            }}
          >
            {uploading ? (
              <Loader2 size={16} className={styles.spinner} aria-hidden />
            ) : (
              <Upload size={16} aria-hidden />
            )}
            <span>{uploading ? '上传中...' : '上传文件'}</span>
            <ChevronDown
              size={14}
              className={`${styles.chevron} ${menuOpen ? styles.chevronOpen : ''}`}
              aria-hidden
            />
          </button>

          {menuOpen ? (
            <div className={styles.menu} role="menu">
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={() => {
                  setMenuOpen(false);
                  onUploadRequest();
                }}
              >
                <Upload size={14} aria-hidden />
                <span>上传文件</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={() => {
                  setMenuOpen(false);
                  onCreateDirectory();
                }}
              >
                <FolderPlus size={14} aria-hidden />
                <span>新建文件夹</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <section className={styles.section}>
        <button
          type="button"
          className={`${styles.navItem} ${atRoot ? styles.navItemActive : ''}`}
          onClick={onSelectRoot}
        >
          <img
            src={resolveFileIconUrl('/', {
              isDir: true,
              folderVariant: 'personal',
            })}
            alt=""
            className={styles.navIcon}
          />
          <span>个人空间</span>
        </button>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>快速访问</div>
        {QUICK_ACCESS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`${styles.navItem} ${styles.navItemSecondary} ${
              isSamePath(currentPath, item.path) ? styles.navItemActive : ''
            }`}
            onClick={() => onSelectPath(item.path)}
          >
            <img
              src={resolveFileIconUrl('/', { isDir: true })}
              alt=""
              className={styles.navIcon}
            />
            <span>{item.label}</span>
          </button>
        ))}
      </section>
    </aside>
  );
};
