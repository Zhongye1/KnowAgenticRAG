/**
 * antd 主题基座。
 *
 * - `StyleProvider layer` 让 antd 的 CSS-in-JS 注入 `@layer antd`，层序在
 *   `src/index.css` 顶部声明；不加这一层时 antd 是无层注入，会压过 Tailwind
 *   工具类与 CSS Modules。
 * - `ConfigProvider` 按 Yuxi `src/stores/theme.js` 平移主题：种子色、链接色、
 *   圆角与字体栈；暗色用 `theme.darkAlgorithm` 并跟随 `html.dark`。
 * - `App`（`component={false}`，不新增 DOM 层）提供主题感知的 `message`，
 *   页面用 `App.useApp()` 取用，避免 antd 对静态方法的上下文告警。
 */
import { StyleProvider } from '@ant-design/cssinjs';
import { App as AntdApp, ConfigProvider, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import * as React from 'react';

import { useIsDarkMode } from '@/shared/lib/theme';

/** 与 Yuxi 的 `fontFamily` token 同值。 */
const FONT_FAMILY =
  "'HarmonyOS Sans SC', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif";

/**
 * 从 `:root` 解析具体色值。token 的事实源在 `src/styles/**`（种子色见 brand.css，
 * 链接色见 yuxi-tokens.css），antd 的色板算法需要具体颜色，因此在这里读一次。
 * 读不到时返回 undefined，交给 antd 用自身默认值，不在这里编造颜色。
 */
function readRootColor(token: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  return value || undefined;
}

export const AntdProvider = ({ children }: { children: React.ReactNode }) => {
  const isDark = useIsDarkMode();

  const theme = React.useMemo(
    () => ({
      algorithm: isDark ? antdTheme.darkAlgorithm : undefined,
      token: {
        fontFamily: FONT_FAMILY,
        colorPrimary: readRootColor('--antd-color-primary-seed'),
        colorLink: readRootColor('--main-color'),
        colorLinkHover: readRootColor('--main-600'),
        colorLinkActive: readRootColor('--main-800'),
        borderRadius: 8,
        wireframe: false,
      },
    }),
    [isDark],
  );

  return (
    <StyleProvider layer>
      <ConfigProvider theme={theme} locale={zhCN}>
        <AntdApp component={false}>{children}</AntdApp>
      </ConfigProvider>
    </StyleProvider>
  );
};
