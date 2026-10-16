import { App as AntdApp } from 'antd';
import * as React from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';

import {
  sanitizeRedirect,
  useCheckFirstRun,
  useLoginBranding,
  useRegister,
  useSystemHealth,
  useUser,
} from '@/entities/session';
import { paths } from '@/shared/config';
import { AuthShell } from '@/widgets/auth-shell';

import { RegisterForm, type RegisterFormValues } from './register-form';
import styles from './register-page.module.css';

const REGISTER_ERROR_FALLBACK = '注册失败，请稍后重试';

/**
 * 自助注册页。
 *
 * 后端在系统未初始化时拒绝注册（否则第一个注册者会让部署方再也建不出超管），所以首启态
 * 这里只给一句说明与回登录页的入口，不渲染表单。已登录用户直接落到目标页。
 */
export const RegisterPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { message } = AntdApp.useApp();

  const branding = useLoginBranding();
  const user = useUser();
  const health = useSystemHealth();
  const firstRun = useCheckFirstRun();
  const register = useRegister();

  const [errorMessage, setErrorMessage] = React.useState('');
  const [agreementAccepted, setAgreementAccepted] = React.useState(false);

  const redirectTo = sanitizeRedirect(
    searchParams.get('redirectTo'),
    paths.app.chat.getHref(),
  );
  const isFirstRun = firstRun.data === true;

  if (user.data) {
    return <Navigate to={redirectTo} replace />;
  }

  const ensureAgreementAccepted = (): boolean => {
    if (!branding.showAgreementConsent || agreementAccepted) return true;
    message.warning('请先阅读并同意《用户协议》《隐私协议》');
    return false;
  };

  const handleRegister = async (values: RegisterFormValues) => {
    if (!ensureAgreementAccepted()) return;

    setErrorMessage('');
    try {
      await register.mutateAsync({
        uid: values.uid.trim(),
        password: values.password,
        phone_number: values.phone_number?.trim() || null,
      });
      message.success('注册成功');
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : REGISTER_ERROR_FALLBACK,
      );
    }
  };

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

  return (
    <AuthShell
      branding={branding}
      health={{
        failed: healthFailed,
        message: healthMessage,
        retrying: health.isFetching,
        onRetry: () => void health.refetch(),
      }}
      title="注册账号"
      error={errorMessage}
      footer={
        isFirstRun ? null : (
          <p className={styles.registerHint}>
            已有账号？
            <Link to={paths.auth.login.getHref(redirectTo)}>登录</Link>
          </p>
        )
      }
    >
      {isFirstRun ? (
        <p className={styles.registerHint}>
          系统尚未初始化，请先
          <Link to={paths.auth.login.getHref(redirectTo)}>创建超级管理员</Link>
        </p>
      ) : (
        <RegisterForm
          loading={register.isPending || firstRun.isLoading}
          onSubmit={handleRegister}
          showAgreement={branding.showAgreementConsent}
          agreement={agreement}
        />
      )}
    </AuthShell>
  );
};
