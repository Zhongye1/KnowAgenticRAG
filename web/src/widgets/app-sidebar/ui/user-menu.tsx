/** 用户菜单。 */
import { Dropdown, type MenuProps } from 'antd';
import { BookOpen, Bug, LogOut, Moon, Settings, Sun } from 'lucide-react';
import * as React from 'react';

import { formatUserRole, useIsSuperuser, useUser } from '@/entities/session';
import { SettingsModal } from '@/features/settings';
import { useDebugPanel } from '@/features/debug';
import { DOCS_URL } from '@/shared/config';
import { toggleTheme, useIsDarkMode } from '@/shared/lib';
import { useNotifications } from '@/shared/ui/notifications';
import { Avatar } from 'antd';

import styles from './user-menu.module.css';

type UserMenuProps = {
  onLogout: () => void;
  /** 折叠态只渲染头像。 */
  collapsed?: boolean;
};

/** 头像兜底：取用户名首字，缺失时用 `?`。 */
function initialsOf(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || '?';
}

export function UserMenu({ onLogout, collapsed = false }: UserMenuProps) {
  const user = useUser();
  const isSuperuser = useIsSuperuser();
  const isDark = useIsDarkMode();
  const setDebugOpen = useDebugPanel((state) => state.setOpen);
  const { addNotification } = useNotifications();
  const [open, setOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  const name = user.data?.username ?? '未登录';
  const uid = user.data?.uid ?? '';
  const roleText = formatUserRole(user.data?.role);
  const avatarUrl = user.data?.avatar ?? '';

  const items: MenuProps['items'] = [
    {
      key: 'identity',
      // 信息展示项：改资料走「设置」，这里只呈现身份，不承载跳转。
      label: (
        <div className={styles.identity}>
          <span className={styles.identityName}>{name}</span>
          <span className={styles.identityMeta}>
            {uid ? `ID: ${uid}` : '未登录'}
          </span>
          <span className={styles.identityMeta}>{roleText}</span>
        </div>
      ),
    },
    { type: 'divider' },
    { key: 'docs', icon: <BookOpen size={16} />, label: '文档中心' },
    {
      key: 'theme',
      icon: isDark ? <Sun size={16} /> : <Moon size={16} />,
      label: isDark ? '切换到浅色模式' : '切换到深色模式',
    },
    ...(isSuperuser
      ? [
          {
            key: 'debug',
            icon: <Bug size={16} />,
            label: '调试面板',
          },
        ]
      : []),
    {
      key: 'settings',
      icon: <Settings size={16} />,
      label: '设置',
    },
    { key: 'logout', icon: <LogOut size={16} />, label: '退出登录' },
  ];

  const handleClick: MenuProps['onClick'] = ({ key, domEvent }) => {
    if (key === 'docs') {
      window.open(DOCS_URL, '_blank', 'noreferrer');
      return;
    }
    if (key === 'theme') {
      // 键盘触发时事件上没有坐标，交给 toggleTheme 用视口中心兜底
      const hasPoint =
        'clientX' in domEvent && Boolean(domEvent.clientX || domEvent.clientY);
      toggleTheme(
        hasPoint ? { x: domEvent.clientX, y: domEvent.clientY } : undefined,
      );
      return;
    }
    if (key === 'debug') {
      setDebugOpen(true);
      return;
    }
    if (key === 'settings') {
      setOpen(false);
      setSettingsOpen(true);
      return;
    }
    if (key === 'logout') {
      onLogout();
    }
  };

  return (
    <>
      <Dropdown
        menu={{ items, onClick: handleClick }}
        trigger={['click']}
        open={open}
        onOpenChange={setOpen}
        placement="topRight"
      >
        <button
          type="button"
          className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
          aria-label="用户菜单"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <Avatar size={28} src={avatarUrl} className={styles.avatar}>
            {initialsOf(name)}
          </Avatar>
          {collapsed ? null : <span className={styles.name}>{name}</span>}
        </button>
      </Dropdown>

      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        notifySuccess={(title) => addNotification({ type: 'success', title })}
        notifyError={(title) => addNotification({ type: 'error', title })}
      />
    </>
  );
}
