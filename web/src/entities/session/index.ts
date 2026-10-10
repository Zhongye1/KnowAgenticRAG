/**
 * 会话切片的对外接口。其余层只从这里引用会话能力，不深入 `api` / `model` / `lib` 内部。
 */
export type {
  CurrentUser,
  InitializeAdminInput,
  LoginResult,
  Discovery,
  OidcConfig,
} from './api/session-api';
export {
  LoginLockedError,
  checkFirstRun,
  getDiscovery,
  getCurrentUser,
  getOidcConfig,
  getOidcLoginUrl,
  initializeAdmin,
  login,
} from './api/session-api';
export type { SystemInfoData, LoginBranding } from './lib/system-info';
export { MIN_PASSWORD_LENGTH } from './lib/password';
export { formatLockRemaining } from './lib/login-lock';
export {
  sanitizeRedirect,
  storeOidcRedirect,
  tryAutoStartOIDC,
} from './lib/oidc-auto-start';
export { useCapabilities, useKnowledgeEnabled } from './model/capabilities';
export { useLoginLock } from './model/login-lock';
export {
  useLoginBranding,
  useSystemHealth,
  useSystemInfo,
} from './model/system-info';
export {
  useCheckFirstRun,
  useInitializeAdmin,
  useIsSuperuser,
  useLogin,
  useLogout,
  useOidcConfig,
  useOidcLoginUrl,
  useUnauthorizedReset,
  useUser,
} from './model/session';
