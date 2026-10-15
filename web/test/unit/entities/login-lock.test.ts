import { describe, expect, it } from 'vitest';

import {
  formatLockRemaining,
  parseRemainingSecondsFromDetail,
} from '@/entities/session/lib/login-lock';

describe('formatLockRemaining', () => {
  it('不足一分钟只显示秒', () => {
    expect(formatLockRemaining(59)).toBe('59秒');
  });

  it('不足一小时显示分与秒', () => {
    expect(formatLockRemaining(60)).toBe('1分0秒');
    expect(formatLockRemaining(3599)).toBe('59分59秒');
  });

  it('不足一天显示小时与分钟', () => {
    expect(formatLockRemaining(3600)).toBe('1小时0分钟');
    expect(formatLockRemaining(86399)).toBe('23小时59分钟');
  });

  it('超过一天显示天与小时', () => {
    expect(formatLockRemaining(86400)).toBe('1天0小时');
    expect(formatLockRemaining(90061)).toBe('1天1小时');
  });
});

describe('parseRemainingSecondsFromDetail', () => {
  it('从后端锁定文案里取剩余秒数', () => {
    expect(
      parseRemainingSecondsFromDetail('由于多次登录失败，账户已被锁定 300 秒'),
    ).toBe(300);
    expect(
      parseRemainingSecondsFromDetail('登录被锁定，请等待 45 秒后再试'),
    ).toBe(45);
  });

  it('普通凭据错误不产生剩余秒数', () => {
    expect(parseRemainingSecondsFromDetail('用户名或密码错误')).toBe(0);
  });

  it('非字符串与零秒都按解析不到处理', () => {
    expect(parseRemainingSecondsFromDetail(undefined)).toBe(0);
    expect(parseRemainingSecondsFromDetail({ detail: '锁定 300 秒' })).toBe(0);
    expect(parseRemainingSecondsFromDetail('账户已被锁定 0 秒')).toBe(0);
  });
});
