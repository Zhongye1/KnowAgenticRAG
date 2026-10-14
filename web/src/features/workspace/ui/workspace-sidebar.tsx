/**
 * 个人空间侧栏。
 *
 * 对齐参照 `WorkspaceSidebar.vue`：顶部「上传文件」下拉（上传文件 / 新建文件夹），下面依次是
 * 个人空间根与快速访问两项。高亮规则与参照同口径——「个人空间」在非快速访问路径下高亮，
 * 快速访问项只在**正好停在**该路径时高亮（进入 `/agents/skills/` 时两项都不亮）。
 *
 * 本切片不含知识库只读浏览，因此没有参照的「我的知识库 / 共享知识库」两段，也没有只读禁用态。
 */
import * as React from 'react';
import { ChevronDown, FolderPlus, Loader2, Upload } from 'lucide-react';

import { QUICK_ACCESS, isQuickAccessPath } from '../lib/workspace-view';
import { isSamePath, normalizePathKey } from '@/shared/lib/workspace-path';
import { resolveFileIconUrl } from '@/shared/lib/file-icon';

import styles from './workspace-sidebar.module.css';

type WorkspaceSidebarProps = {
  currentPath: string;
  uploading: boolean;
  onUploadRequest: () => void;
  onCreateDirectory: () => void;
  onSelectRoot: () => void;
  onSelectPath: (path: string) => void;
};

export const WorkspaceSidebar = ({
  currentPath,
  uploading,
  onUploadRequest,
  onCreateDirectory,
  onSelectRoot,
  onSelectPath,
}: WorkspaceSidebarProps) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  // 点外面收起菜单；用 pointerdown 与参照的 useOutsidePointerdown 同口径
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
