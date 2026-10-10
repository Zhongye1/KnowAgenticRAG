import { beforeEach, describe, expect, it, vi } from 'vitest';

// 这两个类同时是值与类型：值在 vi.mock 之后 await import，类型这里单独引
import type { LoginLockedError as LoginLockedErrorInstance } from '@/entities/session';
import type { ApiError as ApiErrorInstance } from '@/shared/api';

/**
 * 会话 api 段的契约测试。
 *
 * 生成物调用按 `session.test.ts` 的口径整体 mock（那层是生成代码，测的是我们怎么用它、
 * 以及 `{data, error, response}` 怎么折叠成值或 `ApiError`）。登录也在其中：
 * 它要读 423 的 `X-Lock-Remaining`，而「401 不触发会话失效」由 `shared/api` 的
 * 未认证入口规则负责，见 `test/unit/shared/api.test.ts`。
 */
const { sdk } = vi.hoisted(() => ({
  sdk: {
    checkFirstRunApiAuthCheckFirstRunGet: vi.fn(),
    initializeAdminApiAuthInitializePost: vi.fn(),
    getOidcConfigApiAuthOidcConfigGet: vi.fn(),
    getOidcLoginUrlApiAuthOidcLoginUrlGet: vi.fn(),
    loginForAccessTokenApiAuthTokenPost: vi.fn(),
    discoveryApiSystemDiscoveryGet: vi.fn(),
  },
}));

vi.mock('@/shared/api/generated/sdk.gen', () => sdk);

const { LOGIN_LOCKED_STATUS } = await import(
  '@/entities/session/api/session-api'
);

const {
  LoginLockedError,
  MIN_PASSWORD_LENGTH,
  checkFirstRun,
  getOidcConfig,
  getOidcLoginUrl,
  initializeAdmin,
  login,
} = await import('@/entities/session');
const { ApiError, TOKEN_STORAGE_KEY } = await import('@/shared/api');

const token = {
  access_token: 'ars.token',
  token_type: 'bearer',
  user_id: 1,
  uid: 'zwj',
  username: 'zwj',
  role: 'superadmin',
};

/** 生成物失败时带回 HTTP 状态与响应头，`toResultError` 用状态填 `ApiError.status`。 */
const generatedFailure = (
  status: number,
  detail: string,
  headers: Record<string, string> = {},
) => ({
  data: undefined,
  error: { detail },
  response: new Response(null, { status, headers }),
});

describe('login', () => {
  beforeEach(() => {
    window.localStorage.clear();
    sdk.loginForAccessTokenApiAuthTokenPost.mockReset();
  });

  it('按表单编码提交账号密码，成功后写入凭据', async () => {
    sdk.loginForAccessTokenApiAuthTokenPost.mockResolvedValue({
      data: token,
      error: undefined,
    });

    const result = await login({ username: 'zwj', password: 'secret' });

    expect(sdk.loginForAccessTokenApiAuthTokenPost).toHaveBeenCalledWith({
      body: { username: 'zwj', password: 'secret' },
    });
    expect(result.uid).toBe('zwj');
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('ars.token');
  });

  it('423 带 X-Lock-Remaining 时抛出带剩余秒数的锁定错误', async () => {
    sdk.loginForAccessTokenApiAuthTokenPost.mockResolvedValue(
      generatedFailure(
        LOGIN_LOCKED_STATUS,
        '由于多次登录失败，账户已被锁定 300 秒',
        { 'X-Lock-Remaining': '300' },
      ),
    );

    const error = await login({ username: 'zwj', password: 'wrong' }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(LoginLockedError);
    expect((error as LoginLockedErrorInstance).remainingSeconds).toBe(300);
  });

  it('423 缺头时从 detail 文案兜底解析', async () => {
    sdk.loginForAccessTokenApiAuthTokenPost.mockResolvedValue(
      generatedFailure(
        LOGIN_LOCKED_STATUS,
        '由于多次登录失败，账户已被锁定 120 秒',
      ),
    );

    const error = (await login({
      username: 'zwj',
      password: 'wrong',
    }).catch((caught: unknown) => caught)) as LoginLockedErrorInstance;

    expect(error).toBeInstanceOf(LoginLockedError);
    expect(error.remainingSeconds).toBe(120);
  });

  it('423 既无头也无法解析时只带状态码，不编造剩余时间', async () => {
    sdk.loginForAccessTokenApiAuthTokenPost.mockResolvedValue(
      generatedFailure(LOGIN_LOCKED_STATUS, '账户被锁定，请稍后再试'),
    );

    const error = (await login({
      username: 'zwj',
      password: 'wrong',
    }).catch((caught: unknown) => caught)) as LoginLockedErrorInstance;

    expect(error.remainingSeconds).toBe(0);
  });

  it('401 是凭据错误，不是锁定', async () => {
    sdk.loginForAccessTokenApiAuthTokenPost.mockResolvedValue(
      generatedFailure(401, '用户名或密码错误'),
    );

    const error = await login({ username: 'zwj', password: 'wrong' }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(LoginLockedError);
    expect((error as ApiErrorInstance).status).toBe(401);
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });
});

describe('checkFirstRun', () => {
  beforeEach(() => sdk.checkFirstRunApiAuthCheckFirstRunGet.mockReset());

  it('读取 first_run 为真', async () => {
    sdk.checkFirstRunApiAuthCheckFirstRunGet.mockResolvedValue({
      data: { first_run: true },
      error: undefined,
    });

    await expect(checkFirstRun()).resolves.toBe(true);
  });

  it('字段缺失时按非首次运行处理', async () => {
    sdk.checkFirstRunApiAuthCheckFirstRunGet.mockResolvedValue({
      data: {},
      error: undefined,
    });

    await expect(checkFirstRun()).resolves.toBe(false);
  });

  it('后端不可用时不静默当成首次运行', async () => {
    sdk.checkFirstRunApiAuthCheckFirstRunGet.mockResolvedValue(
      generatedFailure(500, '内部错误'),
    );

    const error = await checkFirstRun().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiErrorInstance).status).toBe(500);
  });
});

describe('initializeAdmin', () => {
  beforeEach(() => {
    window.localStorage.clear();
    sdk.initializeAdminApiAuthInitializePost.mockReset();
  });

  it('空手机号按 null 提交，成功后写入凭据', async () => {
    sdk.initializeAdminApiAuthInitializePost.mockResolvedValue({
      data: token,
      error: undefined,
    });

    await initializeAdmin({ uid: 'zwj', password: 'a'.repeat(8) });

    expect(sdk.initializeAdminApiAuthInitializePost).toHaveBeenCalledWith({
      body: { uid: 'zwj', password: 'a'.repeat(8), phone_number: null },
    });
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('ars.token');
  });

  it('已有用户时后端 403 必须向上抛，界面不能当成初始化成功', async () => {
    sdk.initializeAdminApiAuthInitializePost.mockResolvedValue(
      generatedFailure(403, '系统已初始化'),
    );

    await expect(
      initializeAdmin({ uid: 'zwj', password: 'a'.repeat(8) }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('密码长度常量与后端 schema 同值', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });
});

describe('OIDC 端点', () => {
  beforeEach(() => {
    sdk.getOidcConfigApiAuthOidcConfigGet.mockReset();
    sdk.getOidcLoginUrlApiAuthOidcLoginUrlGet.mockReset();
  });

  it('配置缺省字段归一成 null，调用方不必判 undefined', async () => {
    sdk.getOidcConfigApiAuthOidcConfigGet.mockResolvedValue({
      data: { enabled: true },
      error: undefined,
    });

    await expect(getOidcConfig()).resolves.toEqual({
      enabled: true,
      login_url: null,
      provider_name: null,
    });
  });

  it('配置探测失败向上抛，页面据此不渲染第三方登录', async () => {
    sdk.getOidcConfigApiAuthOidcConfigGet.mockResolvedValue(
      generatedFailure(500, '内部错误'),
    );

    await expect(getOidcConfig()).rejects.toBeInstanceOf(ApiError);
  });

  it('登录地址带上回跳路径', async () => {
    sdk.getOidcLoginUrlApiAuthOidcLoginUrlGet.mockResolvedValue({
      data: { login_url: 'https://idp.example.com/auth' },
      error: undefined,
    });

    await expect(getOidcLoginUrl('/agent')).resolves.toEqual({
      login_url: 'https://idp.example.com/auth',
    });
    expect(sdk.getOidcLoginUrlApiAuthOidcLoginUrlGet).toHaveBeenCalledWith({
      query: { redirect_path: '/agent' },
    });
  });

  it('后端没给 login_url 时返回空串，页面按取地址失败处理', async () => {
    sdk.getOidcLoginUrlApiAuthOidcLoginUrlGet.mockResolvedValue({
      data: {},
      error: undefined,
    });

    await expect(getOidcLoginUrl()).resolves.toEqual({ login_url: '' });
  });
});
