/** api 段的对外接口：HTTP 基础设施与凭据存储。生成物只服务手写层，不从这里再导出。 */
export {
  ApiError,
  TOKEN_STORAGE_KEY,
  UNAUTHORIZED_EVENT,
  apiClient,
  apiFetch,
  getAccessToken,
  setAccessToken,
  toApiError,
} from './base';
