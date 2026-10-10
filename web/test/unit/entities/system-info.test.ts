import { describe, expect, it } from 'vitest';

import {
  selectHomeBranding,
  selectLoginBranding,
} from '@/entities/session/lib/system-info';

describe('selectLoginBranding', () => {
  it('配置齐备时按后端事实投影', () => {
    const branding = selectLoginBranding(
      {
        organization: {
          name: '语析',
          logo: '/favicon.svg',
          login_bg: '/login-bg.jpg',
        },
        branding: { name: 'ARS' },
        footer: {
          copyright: '© 语析 2026 v0.7.2',
          user_agreement_url: '/protocols/user-agreement.html',
          privacy_policy_url: '/protocols/privacy-policy.html',
        },
      },
      2026,
    );

    expect(branding).toEqual({
      orgName: '语析',
      brandName: 'ARS',
      logo: '/favicon.svg',
      loginBg: '/login-bg.jpg',
      userAgreementUrl: '/protocols/user-agreement.html',
      privacyPolicyUrl: '/protocols/privacy-policy.html',
      copyright: '© 语析 2026 v0.7.2',
      showAgreementConsent: true,
    });
  });

  it('组织名与品牌名相同时只保留一个，避免重复渲染', () => {
    const branding = selectLoginBranding(
      { organization: { name: 'ARS' }, branding: { name: 'ARS' } },
      2026,
    );

    expect(branding.orgName).toBe('ARS');
    expect(branding.brandName).toBe('ARS');
  });

  it('配置缺失时落到可用的默认品牌与背景图', () => {
    const branding = selectLoginBranding(undefined, 2026);

    expect(branding.brandName).toBe('ARS');
    expect(branding.orgName).toBe('');
    expect(branding.loginBg).toBe('/login-bg.jpg');
    expect(branding.logo).toBe('');
    expect(branding.copyright).toBe('© 2026 ARS. All Rights Reserved.');
  });

  it('只有一侧协议地址时不渲染勾选框，也不做提交门禁', () => {
    const branding = selectLoginBranding(
      { footer: { user_agreement_url: '/protocols/user-agreement.html' } },
      2026,
    );

    expect(branding.showAgreementConsent).toBe(false);
  });

  it('空白字符串按未配置处理', () => {
    const branding = selectLoginBranding(
      {
        organization: { name: '  ', login_bg: '  ' },
        branding: { name: '  ' },
        footer: { user_agreement_url: ' ', privacy_policy_url: ' ' },
      },
      2026,
    );

    expect(branding.orgName).toBe('');
    expect(branding.brandName).toBe('ARS');
    expect(branding.loginBg).toBe('/login-bg.jpg');
    expect(branding.showAgreementConsent).toBe(false);
  });
});

describe('selectHomeBranding', () => {
  it('顶栏用品牌名与 Logo，组织名只参与决定品牌名取值', () => {
    const branding = selectHomeBranding({
      organization: { name: '语析', logo: '/favicon.svg' },
      branding: { name: 'ARS' },
    });

    expect(branding).toEqual({ brandName: 'ARS', logo: '/favicon.svg' });
  });

  it('品牌名缺失时落到 ARS', () => {
    expect(selectHomeBranding({ organization: { name: '语析' } }).brandName).toBe(
      'ARS',
    );
    expect(selectHomeBranding(undefined).brandName).toBe('ARS');
  });

  it('配置缺失时 Logo 为空串', () => {
    expect(selectHomeBranding(undefined).logo).toBe('');
  });
});
