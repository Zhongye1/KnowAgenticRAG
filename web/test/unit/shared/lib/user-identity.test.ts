import { describe, expect, it } from 'vitest';

import { validatePhoneNumber, validateUsername } from '@/shared/lib';

describe('validateUsername', () => {
  it('长度不在 2-20 之间给参照文案', () => {
    expect(validateUsername('a')).toBe('用户名长度必须在 2-20 个字符之间');
    expect(validateUsername('a'.repeat(21))).toBe(
      '用户名长度必须在 2-20 个字符之间',
    );
    expect(validateUsername('  ')).toBe('用户名长度必须在 2-20 个字符之间');
  });

  it('字符集与后端同集：中文、英文、数字、下划线', () => {
    expect(validateUsername('张文杰_01')).toBeNull();
    expect(validateUsername('zwj')).toBeNull();
    expect(validateUsername('zwj-01')).toBe(
      '用户名只能包含中文、英文、数字和下划线',
    );
    expect(validateUsername('zwj x')).toBe(
      '用户名只能包含中文、英文、数字和下划线',
    );
  });
});

describe('validatePhoneNumber', () => {
  it('空串表示清空，放行', () => {
    expect(validatePhoneNumber('')).toBeNull();
    expect(validatePhoneNumber('   ')).toBeNull();
  });

  it('与后端同一正则 ^1[3-9]\\d{9}$', () => {
    expect(validatePhoneNumber('15251638888')).toBeNull();
    expect(validatePhoneNumber('12345678901')).toBe('请输入正确的手机号格式');
    expect(validatePhoneNumber('1525163888')).toBe('请输入正确的手机号格式');
    expect(validatePhoneNumber('152516388881')).toBe('请输入正确的手机号格式');
  });
});
