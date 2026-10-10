import * as React from 'react';

const MOBILE_BREAKPOINT = 768;

/** 断点订阅：媒体查询的 `change` 只负责通知，判定始终现算 `innerWidth`。 */
const subscribe = (onStoreChange: () => void) => {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener('change', onStoreChange);
  return () => mql.removeEventListener('change', onStoreChange);
};

const getSnapshot = () => window.innerWidth < MOBILE_BREAKPOINT;

export function useIsMobile() {
  // 浏览器宽度是外部存储，首帧就要给出正确值：用 effect + setState 会先渲染一次错误布局
  return React.useSyncExternalStore(subscribe, getSnapshot, () => false);
}
