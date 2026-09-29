import { HttpResponse, http } from 'msw';

import { env } from '@/config/env';

import { db, persistDb } from '../db';
import { networkDelay, requireAuth } from '../utils';

/**
 * 个人空间（账号自助）端点的 mock：昵称 / 密码 / 邮箱 / 邮箱验证码。
 *
 * 这些端点改的是**会话用户本身**，所以直接写 `db.user` 那条记录——紧接着的
 * `GET /sys/users/me`（见 `auth.ts`）就能读到新值，与真实后端「改完再查」一致。
 * 验证码与真实后端一样按「最后一次发码」校验，不区分邮箱，够用即可。
 */
const MOCK_EMAIL_CAPTCHA = '123456';
const MIN_PASSWORD_LENGTH = 6;

const ok = (data: unknown = null) =>
  HttpResponse.json({ code: 200, msg: 'success', data });

const fail = (status: number, msg: string) =>
  HttpResponse.json({ code: status, msg, data: null }, { status });

const currentUser = (request: Request) => {
  const { user, error } = requireAuth(request.headers.get('Authorization'));
  return { user, error };
};

export const usersHandlers = [
  http.put(
    `${env.API_URL}/api/v1/sys/users/me/nickname`,
    async ({ request }) => {
      await networkDelay();

      const { user, error } = currentUser(request);
      if (error || !user) return fail(401, 'Unauthorized');

      const body = (await request.json()) as { nickname?: string };
      const nickname = body?.nickname?.trim();
      if (!nickname) return fail(400, '昵称不能为空');

      db.user.update({
        where: { id: { equals: user.id } },
        data: { nickname },
      });
      await persistDb('user');

      return ok();
    },
  ),

  http.put(
    `${env.API_URL}/api/v1/sys/users/me/password`,
    async ({ request }) => {
      await networkDelay();

      const { user, error } = currentUser(request);
      if (error || !user) return fail(401, 'Unauthorized');

      const body = (await request.json()) as {
        old_password?: string;
        new_password?: string;
        confirm_password?: string;
      };

      if (body?.old_password !== user.password) return fail(400, '原密码错误');
      if (body?.new_password !== body?.confirm_password) {
        return fail(400, '两次密码输入不一致');
      }
      if ((body?.new_password ?? '').length < MIN_PASSWORD_LENGTH) {
        return fail(400, `密码长度不能少于 ${MIN_PASSWORD_LENGTH} 个字符`);
      }

      db.user.update({
        where: { id: { equals: user.id } },
        data: { password: body.new_password },
      });
      await persistDb('user');

      return ok();
    },
  ),

  http.post(`${env.API_URL}/api/v1/emails/captcha`, async ({ request }) => {
    await networkDelay();

    const { error } = currentUser(request);
    if (error) return fail(401, 'Unauthorized');

    const body = (await request.json()) as { recipients?: string };
    if (!body?.recipients) return fail(400, '收件人不能为空');

    return ok();
  }),

  http.put(`${env.API_URL}/api/v1/sys/users/me/email`, async ({ request }) => {
    await networkDelay();

    const { user, error } = currentUser(request);
    if (error || !user) return fail(401, 'Unauthorized');

    const body = (await request.json()) as {
      captcha?: string;
      email?: string;
    };

    if (body?.captcha !== MOCK_EMAIL_CAPTCHA) {
      return fail(400, '验证码错误或已失效');
    }

    const email = body?.email?.trim();
    if (!email) return fail(400, '邮箱不能为空');

    db.user.update({
      where: { id: { equals: user.id } },
      data: { email },
    });
    await persistDb('user');

    return ok();
  }),
];

/** 给测试用的验证码常量：断言里直接引用，避免两处各写一份魔法值。 */
export const mockEmailCaptcha = MOCK_EMAIL_CAPTCHA;
