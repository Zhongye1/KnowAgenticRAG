/**
 * 导航列折叠态的本地持久化。
 *
 * 参照实现把折叠态放在 Pinia 持久化的 `chat-ui-store` 里（`pick: ['sidebarCollapsed']`）；
 * 本仓按 `ars_*` 键名约定落 `ars_sidebar_collapsed`，存 `'true'` / `'false'` 两个字面量。
 * 存储不可用、读取抛错或值损坏时返回 `null`，由调用方决定默认值，不把损坏值当成折叠。
 */

/** 折叠态偏好的 localStorage 键名。 */
export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'ars_sidebar_collapsed';

/** 折叠态持久化用的最小存储形状；默认取 `window.localStorage`。 */
export interface SidebarPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 存储不可用（无 window、隐私模式抛错）时返回 null，调用方按未持久化处理。 */
function resolveStorage(
  storage?: SidebarPreferenceStorage | null,
): SidebarPreferenceStorage | null {
  if (storage !== undefined) return storage;

  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** 读取折叠态；存储不可用、读取抛错或值非法时返回 null。 */
export function readSidebarCollapsed(
  storage?: SidebarPreferenceStorage | null,
): boolean | null {
  const target = resolveStorage(storage);
  if (!target) return null;

  try {
    const value = target.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    if (value === 'true') return true;
    if (value === 'false') return false;
    return null;
  } catch {
    return null;
  }
}

/** 写入折叠态；存储不可用或写入抛错时返回 false，调用方不因此改变界面。 */
export function writeSidebarCollapsed(
  collapsed: boolean,
  storage?: SidebarPreferenceStorage | null,
): boolean {
  const target = resolveStorage(storage);
  if (!target) return false;

  try {
    target.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
    return true;
  } catch {
    return false;
  }
}
