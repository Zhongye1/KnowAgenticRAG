/** 导航列品牌区。 */
import { PanelLeft, PanelLeftOpen, Search } from 'lucide-react';
import { Link } from 'react-router';

import { paths } from '@/shared/config';

import styles from './app-sidebar.module.css';

type SidebarBrandProps = {
  brandName: string;
  avatar: string;
  collapsed: boolean;
  searchActive: boolean;
  onToggle: () => void;
  onSearch: () => void;
};

/** 头像兜底：组织头像缺失时用品牌名首字。 */
const brandInitial = (brandName: string) =>
  brandName.trim().slice(0, 1).toUpperCase() || 'A';

export function SidebarBrand({
  brandName,
  avatar,
  collapsed,
  searchActive,
  onToggle,
  onSearch,
}: SidebarBrandProps) {
  const mark = avatar ? (
    <img className={styles.brandAvatar} src={avatar} alt="" />
  ) : (
    <span className={styles.brandAvatarFallback} aria-hidden>
      {brandInitial(brandName)}
    </span>
  );

  if (collapsed) {
    return (
      <div className={styles.brand}>
        <button
          type="button"
          className={`${styles.brandLink} ${styles.brandExpandButton}`}
          aria-label="展开侧边栏"
          onClick={onToggle}
        >
          {mark}
          <PanelLeftOpen className={styles.brandExpandIcon} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className={styles.brand}>
      <Link className={styles.brandLink} to={paths.home.path}>
        {mark}
        <span className={styles.brandName}>{brandName}</span>
      </Link>
      <div className={styles.headerActions} aria-label="侧边栏操作">
        <button
          type="button"
          className={`${styles.headerAction} ${searchActive ? styles.headerActionActive : ''}`}
          aria-label="搜索"
          onClick={onSearch}
        >
          <Search size={17} aria-hidden />
        </button>
        <button
          type="button"
          className={styles.headerAction}
          aria-label="折叠侧边栏"
          onClick={onToggle}
        >
          <PanelLeft size={17} aria-hidden />
        </button>
      </div>
    </div>
  );
}
