import { App as AntdApp, Button } from 'antd';
import { AlertCircle } from 'lucide-react';
import * as React from 'react';
import { Navigate, Link, useNavigate, useSearchParams } from 'react-router';

import {
  LoginLockedError,
  formatLockRemaining,
  sanitizeRedirect,
  storeOidcRedirect,
  tryAutoStartOIDC,
  useCheckFirstRun,
  useInitializeAdmin,
  useLogin,
  useLoginBranding,
  useLoginLock,
  useOidcConfig,
  useOidcLoginUrl,
  useSystemHealth,
  useUser,
} from '@/entities/session';
import { paths } from '@/shared/config';

import {
  InitializeAdminForm,
  type InitializeAdminFormValues,
} from './initialize-admin-form';
import { LoginForm, type LoginFormValues } from './login-form';
import styles from './login-page.module.css';

const LOGIN_ERROR_FALLBACK = '登录失败，请检查用户名和密码';

/** 登录页。 */
export const LoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { message } = AntdApp.useApp();

  const branding = useLoginBranding();
  const user = useUser();
  const health = useSystemHealth();
  const firstRun = useCheckFirstRun();
  const oidcConfig = useOidcConfig();
  const oidcLoginUrl = useOidcLoginUrl();
  const lock = useLoginLock();
  const login = useLogin();
  const initializeAdmin = useInitializeAdmin();

  const [errorMessage, setErrorMessage] = React.useState(
    () => searchParams.get('oidc_error') ?? '',
  );
  const [agreementAccepted, setAgreementAccepted] = React.useState(false);

  // 缺失或不合法时落到聊天页：本仓 `/` 还是占位页，登录成功不该停在那里
  const redirectTo = sanitizeRedirect(
    searchParams.get('redirectTo'),
    paths.app.chat.getHref(),
  );
  const isFirstRun = firstRun.data === true;
  const oidcEnabled = oidcConfig.data?.enabled === true;
  const oidcButtonText = oidcConfig.data?.provider_name?.trim() || 'OIDC 登录';

  const requestOidcLoginUrl = oidcLoginUrl.mutateAsync;
  React.useEffect(() => {
    // 等首次运行与 OIDC 配置都有结论再决定是否自动跳转，否则会把初始化流程也带进 OIDC
    if (firstRun.isLoading || oidcConfig.isLoading) return;
    if (isFirstRun) return;

    void tryAutoStartOIDC(oidcEnabled, {
      getLoginUrl: () => requestOidcLoginUrl(redirectTo),
      navigate: (url) => {
        window.location.href = url;
      },
    });
  }, [
    requestOidcLoginUrl,
    firstRun.isLoading,
    isFirstRun,
    oidcConfig.isLoading,
    oidcEnabled,
    redirectTo,
  ]);

  if (user.data) {
    return <Navigate to={redirectTo} replace />;
  }

  const ensureAgreementAccepted = (): boolean => {
    if (!branding.showAgreementConsent || agreementAccepted) return true;
    message.warning('请先阅读并同意《用户协议》《隐私协议》');
    return false;
  };

  const handleLogin = async (values: LoginFormValues) => {
    if (lock.locked) {
      message.warning(
        `账户被锁定，请等待 ${formatLockRemaining(lock.remainingSeconds)}`,
      );
      return;
    }
    if (!ensureAgreementAccepted()) return;

    setErrorMessage('');
    lock.clear();

    try {
      await login.mutateAsync({
        username: values.loginId,
        password: values.password,
      });
      message.success('登录成功');
      navigate(redirectTo, { replace: true });
    } catch (error) {
      // 423 带剩余秒数时进入倒计时；拿不到秒数就只显示后端文案
      if (error instanceof LoginLockedError && error.remainingSeconds > 0) {
        lock.start(error.remainingSeconds);
        setErrorMessage(
          `由于多次登录失败，账户已被锁定 ${formatLockRemaining(error.remainingSeconds)}`,
        );
        return;
      }
      setErrorMessage(
        error instanceof Error ? error.message : LOGIN_ERROR_FALLBACK,
      );
    }
  };

  const handleInitialize = async (values: InitializeAdminFormValues) => {
    if (!ensureAgreementAccepted()) return;

    setErrorMessage('');
    try {
      await initializeAdmin.mutateAsync({
        uid: values.uid,
        password: values.password,
        phone_number: values.phone_number?.trim() || null,
      });
      message.success('管理员账户创建成功');
      navigate(paths.home.getHref(), { replace: true });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '初始化失败，请重试',
      );
    }
  };

  const handleOidcLogin = async () => {
    if (!ensureAgreementAccepted()) return;

    setErrorMessage('');
    try {
      const { login_url: loginUrl } = await requestOidcLoginUrl(redirectTo);
      if (!loginUrl) {
        setErrorMessage('获取 OIDC 登录地址失败');
        return;
      }
      storeOidcRedirect(redirectTo);
      window.location.href = loginUrl;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'OIDC 登录失败，请重试',
      );
    }
  };

  // 健康检查只表达进程 liveness；非 ok 或请求失败都进告警条
  const healthFailed =
    health.isError ||
    (health.data !== undefined && health.data.status !== 'ok');
  const healthMessage = health.isError
    ? health.error instanceof Error
      ? health.error.message
      : '无法连接到服务端，请检查网络连接'
    : health.data?.message || '服务端状态异常';

  const agreement = {
    accepted: agreementAccepted,
    onChange: setAgreementAccepted,
    userAgreementUrl: branding.userAgreementUrl,
    privacyPolicyUrl: branding.privacyPolicyUrl,
  };
  const showFooterLinks = Boolean(
    branding.userAgreementUrl || branding.privacyPolicyUrl,
  );

  return (
    <div
      className={`${styles.loginView} ${healthFailed ? styles.hasAlert : ''}`}
    >
      {healthFailed ? (
        <div className={styles.serverStatusAlert}>
          <div className={styles.alertContent}>
            <AlertCircle size={20} className={styles.alertIcon} />
            <div className={styles.alertText}>
              <div className={styles.alertTitle}>服务端连接失败</div>
              <div className={styles.alertMessage}>{healthMessage}</div>
            </div>
            <Button
              type="link"
              size="small"
              loading={health.isFetching}
              onClick={() => void health.refetch()}
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
              <img
                className={styles.brandLogo}
                src={branding.logo}
                alt="logo"
              />
            ) : null}
            <h1 className={styles.brandText}>
              {branding.orgName ? (
                <span className={styles.brandOrg}>{branding.orgName}</span>
              ) : null}
              {branding.orgName && branding.brandName !== branding.orgName ? (
                <span className={styles.brandSeparator} />
              ) : null}
              {/* <span className={styles.brandMain}>{branding.brandName}</span> */}
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
                {isFirstRun ? (
                  <h2 className={styles.initTitle}>
                    系统初始化，请创建超级管理员
                  </h2>
                ) : (
                  <p className={styles.welcomeText}>欢迎登录</p>
                )}
              </header>

              <div>
                {isFirstRun ? (
                  <InitializeAdminForm
                    loading={initializeAdmin.isPending}
                    onSubmit={handleInitialize}
                    showAgreement={branding.showAgreementConsent}
                    agreement={agreement}
                  />
                ) : (
                  <LoginForm
                    loading={login.isPending || firstRun.isLoading}
                    locked={lock.locked}
                    lockedLabel={lock.lockedLabel}
                    onSubmit={handleLogin}
                    showAgreement={branding.showAgreementConsent}
                    agreement={agreement}
                    oidc={{
                      checking: oidcConfig.isLoading,
                      enabled: oidcEnabled,
                      loading: oidcLoginUrl.isPending,
                      buttonText: oidcButtonText,
                      onLogin: () => void handleOidcLogin(),
                    }}
                  />
                )}

                {errorMessage ? (
                  <div className={styles.errorMessage}>{errorMessage}</div>
                ) : null}
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
