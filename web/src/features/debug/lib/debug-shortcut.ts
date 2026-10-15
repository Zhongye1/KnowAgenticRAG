/**
 * 调试面板的全局快捷键判定。
 *
 * 组合键是 Ctrl/Cmd + Shift + D。「只对超管生效」的门禁由外壳在调用处执行；
 * 调试数据的授权仍由后端的 `get_admin_user` 兜底，前端判定只影响入口可见性。
 */

/** 判定键盘事件是否命中调试面板快捷键。 */
export function isDebugShortcut(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): boolean {
  if (!event.shiftKey || !(event.ctrlKey || event.metaKey)) return false;

  return event.key === 'D' || event.key === 'd';
}
