import { Button } from 'antd';
import { AlertCircle } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router';

import type { LoginBranding } from '@/entities/session';
import { paths } from '@/shared/config';

import styles from './auth-shell.module.css';

/** 服务端 liveness 的投影：失败与否、文案、重试中与重试入口。 */
export type AuthShellHealth = {
  failed: boolean;
  message: string;
  retrying: boolean;
  onRetry: () => void;
};

type AuthShellProps = {
  branding: LoginBranding;
  health: AuthShellHealth;
  /** 表单侧标题；首启初始化用 `init` 变体（字号更大、主色）。 */
  title: string;
  titleVariant?: 'default' | 'init';
  /** 非空时在表单下方渲染错误条。 */
  error?: string;
  /** 错误条之后的收尾内容（登录页的注册入口、注册页的回登录入口）。 */
  footer?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * 登录与注册共用的视觉外壳：告警条、品牌导航、卡片（左图右表单）与页脚协议链接。
 *
 * 只负责布局与品牌事实；表单、协议门禁与跳转由调用方持有。错误条排在表单与 `footer`
 * 之间，这样错误文案始终紧贴表单，收尾入口不会把它挤走。
 */
export const AuthShell = ({
  branding,
  health,
  title,
  titleVariant = 'default',
  error,
  footer,
  children,
}: AuthShellProps) => {
  const showFooterLinks = Boolean(
    branding.userAgreementUrl || branding.privacyPolicyUrl,
  );

  return (
    <div className={`${styles.loginView} ${health.failed ? styles.hasAlert : ''}`}>
      {health.failed ? (
        <div className={styles.serverStatusAlert}>
          <div className={styles.alertContent}>
            <AlertCircle size={20} className={styles.alertIcon} />
            <div className={styles.alertText}>
              <div className={styles.alertTitle}>服务端连接失败</div>
              <div className={styles.alertMessage}>{health.message}</div>
            </div>
            <Button
              type="link"
              size="small"
              loading={health.retrying}
              onClick={health.onRetry}
            >
              重试
            </Button>
          </div>
        </div>
      ) : null}

      <nav className={styles.loginNavbar}>
        <div className={styles.navbarContent}>
          <Link to={paths.home.getHref()} className={styles.brandContainer}>
            {branding.logo ? (
              <img className={styles.brandLogo} src={branding.logo} alt="logo" />
            ) : null}
            <h1 className={styles.brandText}>
              {branding.orgName ? (
                <span className={styles.brandOrg}>{branding.orgName}</span>
              ) : null}
              {branding.orgName && branding.brandName !== branding.orgName ? (
                <span className={styles.brandSeparator} />
              ) : null}
              {/* 品牌名（后端 branding.name）在组件里被注释掉，暂不渲染 */}
            </h1>
          </Link>
        </div>
      </nav>

      <main className={styles.loginMain}>
        <div className={styles.loginCard}>
          <div className={`${styles.cardSide} ${styles.cardSideImage}`}>
            <img
              className={styles.loginBgImage}
              src={branding.loginBg}
              alt="登录背景"
            />
          </div>

          <div className={`${styles.cardSide} ${styles.cardSideForm}`}>
            <div className={styles.formWrapper}>
              <header className={styles.formHeader}>
                {titleVariant === 'init' ? (
                  <h2 className={styles.initTitle}>{title}</h2>
                ) : (
                  <p className={styles.welcomeText}>{title}</p>
                )}
              </header>

              <div>
                {children}
                {error ? <div className={styles.errorMessage}>{error}</div> : null}
                {footer}
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className={styles.pageFooter}>
        {showFooterLinks ? (
          <div className={styles.footerLinks}>
            {branding.userAgreementUrl ? (
              <a
                href={branding.userAgreementUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                用户协议
              </a>
            ) : null}
            {branding.userAgreementUrl && branding.privacyPolicyUrl ? (
              <span className={styles.footerDivider}>|</span>
            ) : null}
            {branding.privacyPolicyUrl ? (
              <a
                href={branding.privacyPolicyUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                隐私政策
              </a>
            ) : null}
          </div>
        ) : null}
        <div className={styles.copyright}>{branding.copyright}</div>
      </footer>
    </div>
  );
};
