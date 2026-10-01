/**
 * 会话切片的对外接口。其余层只从这里引用会话能力，不深入 `api` / `model` 内部。
 */
export type { CurrentUser, LoginResult, Discovery } from './api/session-api';
export { getDiscovery, getCurrentUser, login } from './api/session-api';
export {
  useCapabilities,
  useKnowledgeEnabled,
} from './model/capabilities';
export {
  useIsSuperuser,
  useLogin,
  useLogout,
  useUnauthorizedReset,
  useUser,
} from './model/session';
