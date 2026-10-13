/**
 * 登录后的全站导航列。
 *
 * 结构对齐参照实现的 `AppLayout.vue`：品牌区、导航、会话列表、底部（GitHub、日夜切换、
 * 用户菜单），右侧内容区由 `app/layouts` 装配。导航项的权限与能力门禁只影响入口可见性，
 * 授权仍由后端执行。
 */
import { GitHubLogoIcon } from '@radix-ui/react-icons';
import { Tooltip } from 'antd';
import { Search } from 'lucide-react';
import * as React from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import {
  useIsSuperuser,
  useLogout,
  useShellBranding,
} from '@/entities/session';
import { useKnowledgeEnabled } from '@/entities/session';
import {
  ConversationList,
  GlobalSearchModal,
  useThreadList,
} from '@/features/chat';
import { REPO_URL, paths } from '@/shared/config';
import { DayNightSwitcher } from '@/shared/ui/DayNightSwitcher';

import { buildNavItems, isNavItemActive } from '../lib/nav-items';
import {
  readSidebarCollapsed,
  writeSidebarCollapsed,
} from '../lib/sidebar-preference';
import styles from './app-sidebar.module.css';
import { SidebarBrand } from './sidebar-brand';
import { UserMenu } from './user-menu';

/** 低频同步：12 秒一次，折叠或页面不可见时跳过。 */
const THREAD_STATUS_SYNC_INTERVAL_MS = 12 * 1000;

export function AppSidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { threadId } = useParams<{ threadId?: string }>();
  const [collapsed, setCollapsed] = React.useState(
    () => readSidebarCollapsed() ?? false,
  );
  const [searchOpen, setSearchOpen] = React.useState(false);
  const syncStatuses = useThreadList((store) => store.syncStatuses);
  const threads = useThreadList((store) => store.threads);
  const upsertThread = useThreadList((store) => store.upsert);
  const logout = useLogout();
  const isSuperuser = useIsSuperuser();
  const knowledgeEnabled = useKnowledgeEnabled();
  const branding = useShellBranding();

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (collapsed) return;
      void syncStatuses();
    }, THREAD_STATUS_SYNC_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [collapsed, syncStatuses]);

  const toggleSidebar = () => {
    // 写入失败只影响下次刷新，不阻断本次折叠。写入放在 setState 之外：
    // StrictMode 下 updater 会执行两次，updater 必须保持纯。
    writeSidebarCollapsed(!collapsed);
    setCollapsed(!collapsed);
  };

  const navItems = buildNavItems({
    knowledgeEnabled: knowledgeEnabled === true,
    isSuperuser,
  });

  return (
    <aside
      className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ''}`}
      aria-label="主导航"
    >
      <SidebarBrand
        brandName={branding.brandName}
        avatar={branding.avatar}
        collapsed={collapsed}
        searchActive={searchOpen}
        onToggle={toggleSidebar}
        onSearch={() => setSearchOpen(true)}
      />

      <nav className={styles.nav} aria-label="页面导航">
        {navItems.map((item) => {
          const active = isNavItemActive(item, pathname);

          return (
            <React.Fragment key={item.title}>
              <Tooltip
                title={item.title}
                placement="right"
                open={collapsed ? undefined : false}
              >
                <Link
                  to={item.url}
                  className={[
                    styles.navItem,
                    item.primary ? styles.primaryAction : '',
                    active ? styles.navItemActive : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-current={active ? 'page' : undefined}
                >
                  <item.icon className={styles.icon} aria-hidden />
                  <span className={styles.navText}>{item.title}</span>
                </Link>
              </Tooltip>
              {/* 参照在折叠态把搜索入口放在主导航项之后；展开态由品牌区的搜索按钮承担 */}
              {item.primary && collapsed ? (
                <Tooltip title="搜索" placement="right">
                  <button
                    type="button"
                    className={`${styles.navItem} ${searchOpen ? styles.navItemActive : ''}`}
                    aria-label="搜索"
                    onClick={() => setSearchOpen(true)}
                  >
                    <Search className={styles.icon} aria-hidden />
                  </button>
                </Tooltip>
              ) : null}
            </React.Fragment>
          );
        })}
      </nav>

      <div className={styles.fill}>
        {/* 参照在折叠态不渲染会话列表，只留空白填充区 */}
        {collapsed ? null : (
          <div className={styles.conversations}>
            <ConversationList currentThreadId={threadId} />
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <a
          className={`${styles.navItem} ${styles.github}`}
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
        >
          <GitHubLogoIcon className={styles.icon} aria-hidden />
          <span className={styles.navText}>GitHub</span>
        </a>
        {/* 折叠态只有 39px 内容宽，44px 的开关放不下，会被 overflow 裁掉；参照也没有这一行 */}
        {collapsed ? null : (
          <div className={styles.navItem}>
            <DayNightSwitcher />
            <span className={styles.navText}>日夜模式</span>
          </div>
        )}
        <div className={styles.userInfo}>
          <UserMenu
            collapsed={collapsed}
            onLogout={() => logout.mutate(undefined)}
          />
        </div>
      </div>

      <GlobalSearchModal
        open={searchOpen}
        onOpenChange={setSearchOpen}
        recentThreads={threads}
        onSelectThread={(thread) => {
          if (!thread) {
            navigate(paths.app.chat.getHref());
            return;
          }
          // 先写回列表：跳转后侧边栏立刻能看到这条，不必等下一次拉取
          upsertThread(thread);
          navigate(paths.app.chat.getHref(thread.id));
        }}
      />
    </aside>
  );
}
