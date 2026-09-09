/**
 * 未实现接口的占位定义。
 *
 * 已实现的接口（login / register / getCaptcha / logout / getCurrentUser）已有
 * OpenAPI 自动生成封装（src/generated/auth/*、src/generated/sys-users/*），
 * 消费方直接引用生成模块即可，这里不再重复封装。
 *
 * 以下三个接口当前后端尚未提供，先以占位形式定义，UI 显示"开发中"：
 *   - createQrCode / pollQrStatus：扫码登录（约定端点 POST /api/v1/auth/qr-code、
 *     GET /api/v1/auth/qr-code/{uuid}/status，后端补齐后替换占位实现即可）
 *   - getOAuthUrl：QQ/微信 OAuth（当前后端仅有 github/google，见 src/generated/oauth2-*）
 */
/** 后端尚未实现的接口统一抛错，UI 层据此渲染占位而不是报错。 */
export class BackendNotImplementedError extends Error {
  constructor(feature: string) {
    super(`[${feature}] 后端接口尚未实现`);
    this.name = 'BackendNotImplementedError';
  }
}

export type QrLoginProvider = 'qq' | 'wechat';

export type QrCodePayload = {
  uuid: string;
  image: string;
  expire_seconds: number;
};

export type QrStatusPayload = {
  status: 'pending' | 'scanned' | 'confirmed' | 'expired';
  access_token?: string;
  refresh_token?: string;
};

/** 扫码登录：创建二维码（占位，后端未实现）。 */
export const createQrCode = async (): Promise<QrCodePayload> => {
  throw new BackendNotImplementedError('扫码登录');
};

/** 扫码登录：轮询二维码状态（占位，后端未实现）。 */
export const pollQrStatus = async (
  uuid: string,
): Promise<QrStatusPayload> => {
  // 占位实现：保留入参契约，待后端提供轮询端点后替换
  void uuid;
  throw new BackendNotImplementedError('扫码登录');
};

/** QQ/微信 OAuth：获取授权链接（占位，后端未实现）。 */
export const getOAuthUrl = async (
  provider: QrLoginProvider,
): Promise<string> => {
  throw new BackendNotImplementedError(`${provider} OAuth`);
};
