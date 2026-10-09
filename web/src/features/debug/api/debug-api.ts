/**
 * 全局调试弹窗的接口。
 *
 * 契约：`backend/server/routers/system_router.py` 的日志与配置端点是只读的（写配置要按
 * `_config_items[key].type` 提交布尔/数组等真实类型，属于后端管理动作，这里不做）；
 * `auth_router.py` 的用户与身份切换端点用于调试。全部要求超管（`get_admin_user`）——
 * 界面上入口只对超管显示，但授权边界在后端。
 */
import {
  getConfigApiSystemConfigGet,
  getSystemLogsApiSystemLogsGet,
  impersonateUserApiAuthImpersonateUserIdPost,
  readUsersApiAuthUsersGet,
} from '@/shared/api/generated/sdk.gen';
import { setAccessToken, unwrap } from '@/shared/api';

/** 日志响应：后端把整份日志塞在 `log` 字段里。 */
export type SystemLogsResponse = { log?: string };

/** 用户列表项（`UserResponse` 用得到的字段）。 */
export type DebugUser = {
  id: number;
  uid: string;
  username: string;
  role: string;
  department_id?: number | null;
  department_name?: string | null;
};

export const debugApi = {
  /** 系统日志；`levels` 为空表示不限级别。 */
  async getLogs(levels?: string): Promise<string> {
    const result = unwrap<SystemLogsResponse>(
      await getSystemLogsApiSystemLogsGet({
        query: levels ? { levels } : {},
      }),
    );
    return result.log ?? '';
  },

  /** 系统配置（未脱敏的管理员视图）。 */
  async getConfig(): Promise<Record<string, unknown>> {
    return unwrap<Record<string, unknown>>(await getConfigApiSystemConfigGet());
  },

  /** 用户列表（超管可见全部）。 */
  async listUsers(): Promise<DebugUser[]> {
    return unwrap<DebugUser[]>(await readUsersApiAuthUsersGet());
  },

  /**
   * 切换成另一个用户：后端发一张该用户的令牌，这里写回凭据存储。
   *
   * 危险操作，调用方必须先二次确认；失败时旧令牌保持不动（先拿令牌再落盘）。
   */
  async impersonate(userId: number): Promise<string> {
    const result = unwrap<{ access_token?: string }>(
      await impersonateUserApiAuthImpersonateUserIdPost({
        path: { user_id: userId },
      }),
    );
    const token = result.access_token ?? '';
    if (!token) throw new Error('切换用户失败：后端没有返回令牌。');
    setAccessToken(token);
    return token;
  },
};
