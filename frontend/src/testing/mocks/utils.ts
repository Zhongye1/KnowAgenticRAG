import Cookies from 'js-cookie';
import { delay } from 'msw';

import { db } from './db';

/**
 * mock token 的编解码必须按 **UTF-8** 走。
 *
 * `btoa`/`atob` 只认 latin1：用户信息里只要出现中文（例如角色名「测试」），
 * 编码时会被截断成控制字符，解码端 `JSON.parse` 直接抛错——而 `requireAuth` 把这个
 * 异常吞成「未登录」，表现就是接口 200 + `data: null`，很难查。用 Buffer/TextCodec
 * 显式转 UTF-8，中文英文都安全。
 */
const toBase64 = (text: string) =>
  typeof Buffer === 'undefined'
    ? btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    : Buffer.from(text, 'utf8').toString('base64');

const fromBase64 = (base64: string) =>
  typeof Buffer === 'undefined'
    ? new TextDecoder().decode(
        Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)),
      )
    : Buffer.from(base64, 'base64').toString('utf8');

export const encode = (obj: any) => toBase64(JSON.stringify(obj));

export const decode = (str: string) => JSON.parse(fromBase64(str));

export const hash = (str: string) => {
  let hash = 5381,
    i = str.length;

  while (i) {
    hash = (hash * 33) ^ str.charCodeAt(--i);
  }
  return String(hash >>> 0);
};

export const networkDelay = () => {
  const delayTime = import.meta.env.TEST
    ? 200
    : Math.floor(Math.random() * 700) + 300;
  return delay(delayTime);
};

const omit = <T extends object>(obj: T, keys: string[]): T => {
  const result = {} as T;
  for (const key in obj) {
    if (!keys.includes(key)) {
      result[key] = obj[key];
    }
  }

  return result;
};

export const sanitizeUser = <O extends object>(user: O) =>
  omit<O>(user, ['password', 'iat']);

export function authenticate({
  username,
  password,
}: {
  username: string;
  password: string;
}) {
  const user = db.user.findFirst({
    where: {
      username: {
        equals: username,
      },
    },
  });

  if (user?.password === hash(password)) {
    const sanitizedUser = sanitizeUser(user);
    const encodedToken = encode(sanitizedUser);
    return { user: sanitizedUser, access_token: encodedToken };
  }

  const error = new Error('Invalid username or password');
  throw error;
}

export const AUTH_COOKIE = `bulletproof_react_app_token`;

export function requireAuth(
  authorizationOrCookies?: string | Record<string, string> | null,
  cookies?: Record<string, string>,
) {
  try {
    // 兼容两种调用：新调用传 Authorization 头，旧调用传 request cookies
    const authorization =
      typeof authorizationOrCookies === 'string'
        ? authorizationOrCookies
        : null;
    const cookieStore =
      typeof authorizationOrCookies === 'object'
        ? authorizationOrCookies
        : cookies;
    const bearer = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : null;
    const encodedToken =
      bearer || cookieStore?.[AUTH_COOKIE] || Cookies.get(AUTH_COOKIE);
    if (!encodedToken) {
      return { error: 'Unauthorized', user: null };
    }
    const decodedToken = decode(encodedToken) as { id: string };

    const user = db.user.findFirst({
      where: {
        id: {
          equals: decodedToken.id,
        },
      },
    });

    if (!user) {
      return { error: 'Unauthorized', user: null };
    }

    return { user: sanitizeUser(user) };
  } catch (err: any) {
    return { error: 'Unauthorized', user: null };
  }
}
