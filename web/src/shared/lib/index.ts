/** lib 段的对外接口。 */
export { queryConfig } from './react-query';
export type { MutationConfig, QueryConfig } from './react-query';
export { copyTextToClipboard } from './clipboard';
export { avatarBackground, avatarInitials } from './avatar';
export {
  formatExtensionTitle,
  formatMinuteStamp,
  formatRelativeTime,
  formatResultDate,
  splitSnippet,
  toShanghaiDate,
} from './format';
export type { SnippetSegment } from './format';
export { cn } from './utils';
export {
  applyTheme,
  getInitialTheme,
  THEME_STORAGE_KEY,
  toggleTheme,
  useIsDarkMode,
} from './theme';
export type { Theme } from './theme';
export { useCopyToClipboard, useDebouncedValue, useDisclosure } from './hooks';
export { validatePhoneNumber, validateUsername } from './user-identity';
