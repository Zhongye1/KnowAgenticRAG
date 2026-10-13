/**
 * 登录后的全站外壳。
 *
 * 单侧边栏加内容区，与参照实现的 `AppLayout.vue` 同构：导航列自己撑满高度，内容区
 * 独立滚动。调试面板与它的全局快捷键在这里挂载一次，用户菜单只切同一个开关。
 */
import * as React from 'react';

import { useIsSuperuser } from '@/entities/session';
import { DebugModal, isDebugShortcut, useDebugPanel } from '@/features/debug';
import { AppSidebar } from '@/widgets/app-sidebar';

import styles from './app-shell.module.css';

/** 调试面板挂载点：只有超管渲染，避免普通用户拉起管理端查询。 */
function DebugPanelHost() {
  const open = useDebugPanel((state) => state.open);
  const setOpen = useDebugPanel((state) => state.setOpen);

  return <DebugModal open={open} onOpenChange={setOpen} />;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const isSuperuser = useIsSuperuser();
  const toggleDebugPanel = useDebugPanel((state) => state.toggle);

  React.useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (!isSuperuser) return;
      if (!isDebugShortcut(event)) return;

      event.preventDefault();
      toggleDebugPanel();
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [isSuperuser, toggleDebugPanel]);

  return (
    <div className={styles.layout}>
      <AppSidebar />
      <main className={styles.content}>{children}</main>
      {isSuperuser ? <DebugPanelHost /> : null}
    </div>
  );
}
