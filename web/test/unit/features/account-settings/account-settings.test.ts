import { describe, expect, it } from 'vitest';

import {
  roleValueColor,
  validateAvatarFile,
} from '@/features/account-settings/lib/account-settings';

describe('validateAvatarFile', () => {
  it('非图片给参照文案', () => {
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    expect(validateAvatarFile(file)).toBe('只能上传图片文件！');
  });

  it('5MB 及以上给参照文案', () => {
    const atLimit = new File(['x'], 'a.png', { type: 'image/png' });
    Object.defineProperty(atLimit, 'size', { value: 5 * 1024 * 1024 });
    expect(validateAvatarFile(atLimit)).toBe('图片大小不能超过 5MB！');

    const under = new File(['x'], 'a.png', { type: 'image/png' });
    Object.defineProperty(under, 'size', { value: 5 * 1024 * 1024 - 1 });
    expect(validateAvatarFile(under)).toBeNull();
  });
});

describe('roleValueColor', () => {
  it('三种角色与未知角色各走一个 token', () => {
    expect(roleValueColor('superadmin')).toBe('var(--color-error-700)');
    expect(roleValueColor('admin')).toBe('var(--main-500)');
    expect(roleValueColor('user')).toBe('var(--color-success-500)');
    expect(roleValueColor('other')).toBe('var(--gray-600)');
    expect(roleValueColor(null)).toBe('var(--gray-600)');
  });
});
