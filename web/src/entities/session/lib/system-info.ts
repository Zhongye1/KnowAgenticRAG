/**
 * 系统信息接口返回的品牌投影。
 *
 * 事实源是后端 `info.template.yaml`（可由 `ARS_BRAND_FILE_PATH` 覆盖）；
 * 配置缺失或请求失败时用登录页可用的默认值，不让品牌信息阻塞登录。
 */

export type SystemInfoData = {
  organization?: {
    name?: string;
    logo?: string;
    avatar?: string;
    login_bg?: string;
  };
  branding?: {
    name?: string;
    title?: string;
    subtitle?: string;
    subtitles?: string[];
  };
  footer?: {
    copyright?: string;
    user_agreement_url?: string;
    privacy_policy_url?: string;
  };
};

export type LoginBranding = {
  /** 组织名，顶部品牌栏左半段；为空则不渲染。 */
  orgName: string;
  /** 品牌名，顶部品牌栏右半段；与组织名相同时只渲染一次。 */
  brandName: string;
  logo: string;
  loginBg: string;
  userAgreementUrl: string;
  privacyPolicyUrl: string;
  copyright: string;
  /** 两个协议地址都配置了才渲染勾选框，也才做提交前门禁。 */
  showAgreementConsent: boolean;
};

/** 组织名与品牌名不同才加分隔点，避免出现「语析 · 语析」。 */
export function selectLoginBranding(
  info: SystemInfoData | undefined,
  year: number = new Date().getFullYear(),
): LoginBranding {
  const orgName = info?.organization?.name?.trim() ?? '';
  const brandName = info?.branding?.name?.trim() || 'ARS';
  const userAgreementUrl = info?.footer?.user_agreement_url?.trim() ?? '';
  const privacyPolicyUrl = info?.footer?.privacy_policy_url?.trim() ?? '';

  return {
    orgName,
    brandName: orgName && orgName !== brandName ? brandName : orgName || brandName,
    logo: info?.organization?.logo?.trim() ?? '',
    loginBg: info?.organization?.login_bg?.trim() || '/login-bg.jpg',
    userAgreementUrl,
    privacyPolicyUrl,
    copyright:
      info?.footer?.copyright?.trim() ||
      `© ${year} ${brandName}. All Rights Reserved.`,
    showAgreementConsent: Boolean(userAgreementUrl && privacyPolicyUrl),
  };
}
