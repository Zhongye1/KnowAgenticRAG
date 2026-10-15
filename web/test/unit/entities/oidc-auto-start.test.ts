import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  hasAutoStartAttempted,
  markAutoStartAttempted,
  readOidcRedirect,
  sanitizeRedirect,
  tryAutoStartOIDC,
} from '@/entities/session/lib/oidc-auto-start';

const getLoginUrl = vi.fn();
const navigate = vi.fn();

function setSearch(search: string) {
  window.history.replaceState({}, '', `/login${search}`);
}

describe('sanitizeRedirect', () => {
  it('放行站内相对路径', () => {
    expect(sanitizeRedirect('/agent')).toBe('/agent');
    expect(sanitizeRedirect('/agent?thread=1')).toBe('/agent?thread=1');
    expect(sanitizeRedirect('/')).toBe('/');
  });

  it('挡掉协议相对地址与绝对地址', () => {
    expect(sanitizeRedirect('//evil.example.com')).toBe('/');
    expect(sanitizeRedirect('/\\evil.example.com')).toBe('/');
    expect(sanitizeRedirect('https://evil.example.com')).toBe('/');
    expect(sanitizeRedirect('javascript:alert(1)')).toBe('/');
  });

  it('缺失与非字符串回落到首页', () => {
    expect(sanitizeRedirect(null)).toBe('/');
    expect(sanitizeRedirect(undefined)).toBe('/');
    expect(sanitizeRedirect(['/agent'])).toBe('/');
  });
});

describe('tryAutoStartOIDC', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    getLoginUrl.mockReset();
    navigate.mockReset();
    setSearch('');
  });

  it('OIDC 未启用时不跳转', async () => {
    setSearch('?autostartOidc');

    await expect(
      tryAutoStartOIDC(false, { getLoginUrl, navigate }),
    ).resolves.toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('回调带 oidc_error 时不再自动跳转，避免来回循环', async () => {
    setSearch('?autostartOidc&oidc_error=invalid_state');

    await expect(
      tryAutoStartOIDC(true, { getLoginUrl, navigate }),
    ).resolves.toBe(false);
    expect(getLoginUrl).not.toHaveBeenCalled();
  });

  it('缺少 autostartOidc 参数时不跳转', async () => {
    await expect(
      tryAutoStartOIDC(true, { getLoginUrl, navigate }),
    ).resolves.toBe(false);
    expect(getLoginUrl).not.toHaveBeenCalled();
  });

  it('同一会话已尝试过就不再跳转', async () => {
    setSearch('?autostartOidc');
    markAutoStartAttempted();

    await expect(
      tryAutoStartOIDC(true, { getLoginUrl, navigate }),
    ).resolves.toBe(false);
    expect(getLoginUrl).not.toHaveBeenCalled();
  });

  it('取地址失败或没有 login_url 时保持停在登录页', async () => {
    setSearch('?autostartOidc');
    getLoginUrl.mockRejectedValueOnce(new Error('boom'));
    await expect(
      tryAutoStartOIDC(true, { getLoginUrl, navigate }),
    ).resolves.toBe(false);

    getLoginUrl.mockResolvedValueOnce({ login_url: null });
    await expect(
      tryAutoStartOIDC(true, { getLoginUrl, navigate }),
    ).resolves.toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('条件齐备时记录站内回跳地址并跳转到 provider', async () => {
    setSearch('?autostartOidc&redirect=/agent?thread=1');
    getLoginUrl.mockResolvedValue({
      login_url: 'https://idp.example.com/auth',
    });

    await expect(
      tryAutoStartOIDC(true, { getLoginUrl, navigate }),
    ).resolves.toBe(true);

    expect(navigate).toHaveBeenCalledWith('https://idp.example.com/auth');
    expect(readOidcRedirect()).toBe('/agent?thread=1');
    expect(hasAutoStartAttempted()).toBe(true);
  });

  it('回跳地址是站外地址时只存首页', async () => {
    setSearch('?autostartOidc&redirect=//evil.example.com');
    getLoginUrl.mockResolvedValue({
      login_url: 'https://idp.example.com/auth',
    });

    await expect(
      tryAutoStartOIDC(true, { getLoginUrl, navigate }),
    ).resolves.toBe(true);

    expect(readOidcRedirect()).toBe('/');
  });
});
