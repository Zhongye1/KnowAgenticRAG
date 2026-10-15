/**
 * 系统信息接口的返回形状，以及按页面取的品牌投影。
 *
 * 形状的事实源是后端 `info.template.yaml`（可由 `ARS_BRAND_FILE_PATH` 覆盖）；
 * 配置缺失或请求失败时落到各自的默认值，不让品牌信息阻塞页面。
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

/** 组织名与品牌名相同时只保留一个；品牌名为空时退化为 `KnowAgenticRAG`。 */
function resolveBrandName(orgName: string, rawBrandName: string): string {
  const brandName = rawBrandName.trim() || 'KnowAgenticRAG';
  return orgName && orgName !== brandName ? brandName : orgName || brandName;
}

function resolveCopyright(
  info: SystemInfoData | undefined,
  brandName: string,
  year: number,
): string {
  return (
    info?.footer?.copyright?.trim() ||
    `© ${year} ${brandName}. All Rights Reserved.`
  );
}


export function selectLoginBranding(
  info: SystemInfoData | undefined,
  year: number = new Date().getFullYear(),
): LoginBranding {
  const orgName = info?.organization?.name?.trim() ?? '';
  const brandName = resolveBrandName(orgName, info?.branding?.name ?? '');
  const userAgreementUrl = info?.footer?.user_agreement_url?.trim() ?? '';
  const privacyPolicyUrl = info?.footer?.privacy_policy_url?.trim() ?? '';

  return {
    orgName,
    brandName,
    logo: info?.organization?.logo?.trim() ?? '',
    loginBg: info?.organization?.login_bg?.trim() || '/login-bg.jpg',
    userAgreementUrl,
    privacyPolicyUrl,
    copyright: resolveCopyright(info, brandName, year),
    showAgreementConsent: Boolean(userAgreementUrl && privacyPolicyUrl),
  };
}

export type ShellBranding = {
  /** 导航列品牌名：组织名优先，退到品牌名，再退到 `KnowAgenticRAG`。 */
  brandName: string;
  /** 导航列头像地址；为空时由调用方决定兜底呈现。 */
  avatar: string;
};

/**
 * 导航列品牌投影。
 *
 * 与登录页、首页的投影分开：导航列只取组织名与组织头像，不消费页脚与品牌标题。
 * 组织名为空时退到品牌名，两者都为空时用 `KnowAgenticRAG`，与登录页兜底同值。
 */
export function selectShellBranding(
  info: SystemInfoData | undefined,
): ShellBranding {
  const orgName = info?.organization?.name?.trim() ?? '';

  return {
    brandName:
      orgName || (info?.branding?.name?.trim() ?? '') || 'KnowAgenticRAG',
    avatar: info?.organization?.avatar?.trim() ?? '',
  };
}

export type HomeBranding = {
  brandName: string;
  logo: string;
};

/**
 * 首页顶栏投影。
 *
 * 首页正文照搬参照实现，顶栏只渲染品牌名与 Logo，因此不投影 `organization.name`、
 * `branding.title` 与 `footer.copyright`：组织名只用于决定品牌名的取值。
 */
export function selectHomeBranding(
  info: SystemInfoData | undefined,
): HomeBranding {
  const orgName = info?.organization?.name?.trim() ?? '';

  return {
    brandName: resolveBrandName(orgName, info?.branding?.name ?? ''),
    logo: info?.organization?.logo?.trim() ?? '',
  };
}
