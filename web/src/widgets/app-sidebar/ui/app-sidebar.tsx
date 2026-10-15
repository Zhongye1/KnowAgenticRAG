/**
 * 登录后的全站导航列。
 *
 * 结构对齐参照实现的 `AppLayout.vue`：品牌区、导航、会话列表、底部（GitHub 与日夜切换
 * 同一行，用户菜单与任务中心同一行），右侧内容区由 `app/layouts` 装配。导航项的权限与
 * 能力门禁只影响入口可见性，授权仍由后端执行。
 */
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
import { TaskCenter } from '@/features/task-center';
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
        <div className={styles.githubRow}>
          <a
            className={`${styles.navItem} ${styles.github}`}
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
          >
            {/* lucide 不再带品牌图标，这里沿用参照实现的内联 GitHub 图形 */}
            <svg
              className={styles.icon}
              viewBox="0 0 16 16"
              width="16"
              height="16"
              fill="currentColor"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
              />
            </svg>
            <span className={styles.navText}>GitHub</span>
          </a>
          {/* 折叠态只有 39px 内容宽，44px 的开关放不下，会被 overflow 裁掉；
              主题仍可从用户菜单切换 */}
          {collapsed ? null : (
            <DayNightSwitcher className={styles.themeSwitch} />
          )}
        </div>
        <div className={styles.userRow}>
          <UserMenu
            collapsed={collapsed}
            onLogout={() => logout.mutate(undefined)}
          />
          <TaskCenter collapsed={collapsed} />
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
