import Cookies from 'js-cookie';
import { HttpResponse, http } from 'msw';

import { env } from '@/config/env';

import { db, persistDb } from '../db';
import {
  authenticate,
  hash,
  requireAuth,
  sanitizeUser,
  AUTH_COOKIE,
  networkDelay,
} from '../utils';

type RegisterBody = {
  username: string;
  password: string;
  nickname?: string;
  email?: string;
};

type LoginBody = {
  username: string;
  password: string;
  uuid?: string;
  captcha?: string;
};

// 与真实后端保持一致：响应统一包 { code, msg, data }
export const authHandlers = [
  http.post(`${env.API_URL}/api/v1/auth/register`, async ({ request }) => {
    await networkDelay();
    try {
      const body = (await request.json()) as RegisterBody;

      const existingUser = db.user.findFirst({
        where: {
          username: {
            equals: body.username,
          },
        },
      });

      if (existingUser) {
        return HttpResponse.json(
          { code: 400, msg: '用户名已存在', data: null },
          { status: 400 },
        );
      }

      const user = db.user.create({
        username: body.username,
        nickname: body.nickname ?? body.username,
        email: body.email ?? '',
        password: hash(body.password),
        firstName: body.username,
        lastName: '',
        role: 'USER',
        teamId: '',
        bio: '',
      });

      await persistDb('user');

      // 真实后端注册不发 token（见 docs/工程治理/auth-flow.md），只返回用户信息
      return HttpResponse.json({ data: sanitizeUser(user) });
    } catch (error: any) {
      return HttpResponse.json(
        { code: 500, msg: error?.message || 'Server Error', data: null },
        { status: 500 },
      );
    }
  }),

  http.post(`${env.API_URL}/api/v1/auth/login`, async ({ request }) => {
    await networkDelay();

    try {
      const body = (await request.json()) as LoginBody;
      const result = authenticate(body);

      // todo: remove once tests in Github Actions are fixed
      Cookies.set(AUTH_COOKIE, result.access_token, { path: '/' });

      return HttpResponse.json(
        {
          data: {
            access_token: result.access_token,
            access_token_expire_time: new Date(
              Date.now() + 60 * 60 * 1000,
            ).toISOString(),
            session_uuid: 'mock-session',
            user: result.user,
          },
        },
        {
          headers: {
            // with a real API server, the refresh token cookie should be Secure and HttpOnly
            'Set-Cookie': `${AUTH_COOKIE}=${result.access_token}; Path=/;`,
          },
        },
      );
    } catch (error: any) {
      return HttpResponse.json(
        { code: 401, msg: error?.message || '用户名或密码错误', data: null },
        { status: 401 },
      );
    }
  }),

  http.post(`${env.API_URL}/api/v1/auth/logout`, async () => {
    await networkDelay();

    // todo: remove once tests in Github Actions are fixed
    Cookies.remove(AUTH_COOKIE);

    return HttpResponse.json(
      { data: null },
      {
        headers: {
          'Set-Cookie': `${AUTH_COOKIE}=; Path=/;`,
        },
      },
    );
  }),

  http.get(`${env.API_URL}/api/v1/auth/captcha`, async () => {
    await networkDelay();

    // 默认关闭验证码，登录表单里不显示验证码输入框
    return HttpResponse.json({
      data: {
        is_enabled: false,
        expire_seconds: 60,
        uuid: 'mock-captcha-uuid',
        image: '',
      },
    });
  }),

  http.get(`${env.API_URL}/api/v1/sys/users/me`, async ({ request }) => {
    await networkDelay();

    try {
      const { user } = requireAuth(request.headers.get('Authorization'));
      return HttpResponse.json({ data: user });
    } catch (error: any) {
      return HttpResponse.json(
        { code: 401, msg: error?.message || 'Unauthorized', data: null },
        { status: 401 },
      );
    }
  }),
];
