import { randEmail, randPassword, randUserName } from '@ngneat/falso';

/**
 * 会话用户生成器：字段对齐后端 `GET /sys/users/me`（GetCurrentUserInfoWithRelationDetail）。
 * 需要别的取值时用 `createUser({ ... })` 覆写，不要在这里堆业务分支。
 */
const generateUser = () => ({
  id: randUserName({ withAccents: false }),
  username: randUserName({ withAccents: false }),
  nickname: randUserName({ withAccents: false }),
  avatar: '',
  email: randEmail(),
  phone: '',
  password: randPassword(),
  dept: '',
  roles: ['测试'] as string[],
  is_superuser: false,
  createdAt: Date.now(),
});

export const createUser = <T extends Partial<ReturnType<typeof generateUser>>>(
  overrides?: T,
) => {
  return { ...generateUser(), ...overrides };
};
