import { useCallback, useEffect, useState } from 'react';

import { getCaptcha } from '@/generated/auth/get-captcha';
import { getGoogleOauth2Url } from '@/generated/oauth2-google/get-google-oauth2-url';
import type { GetCaptchaDetail } from '@/generated/types';
import { useLogin } from '@/lib/auth';

import { getErrorMessage } from '../../api/errors';
import { RegisterForm } from '../register-form';
import './index.css';

type AuthMode = 'login' | 'register';

function EyeIcon({ show }: { show: boolean }) {
  return show ? (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function AuthFormPanel() {
  const [mode, setMode] = useState<AuthMode>('login');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [captcha, setCaptcha] = useState<GetCaptchaDetail | null>(null);
  const [captchaCode, setCaptchaCode] = useState('');
  const [captchaRefresh, setCaptchaRefresh] = useState(0);

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [usernameError, setUsernameError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [captchaError, setCaptchaError] = useState(false);

  useEffect(() => {
    if (mode !== 'login') return;
    let cancelled = false;
    getCaptcha()
      .then((data) => {
        if (!cancelled) setCaptcha(data);
      })
      .catch(() => {
        if (!cancelled) setCaptcha(null);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, captchaRefresh]);

  const refreshCaptcha = useCallback(() => {
    setCaptchaCode('');
    setCaptchaRefresh((prev) => prev + 1);
  }, []);

  const login = useLogin({
    // 登录成功后 routes/auth 会监听 user.data 自动跳转到 redirectTo
    onError: (error) => {
      setErrorMsg(getErrorMessage(error, '登录失败，请稍后重试'));
      if (captcha?.is_enabled) {
        refreshCaptcha();
      }
    },
  });

  const captchaEnabled = Boolean(captcha?.is_enabled);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setErrorMsg('');
    setSuccessMsg('');
    if (next === 'login') setCaptchaCode('');
    setUsernameError(false);
    setPasswordError(false);
    setCaptchaError(false);
  };

  const onSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setUsernameError(false);
    setPasswordError(false);
    setCaptchaError(false);
    setErrorMsg('');

    const cleanUsername = username.trim();

    if (!cleanUsername) {
      setUsernameError(true);
      setErrorMsg('请输入用户名');
      return;
    }

    if (!password || password.length < 6) {
      setPasswordError(true);
      setErrorMsg('密码至少 6 位');
      return;
    }

    if (captchaEnabled && !captchaCode.trim()) {
      setCaptchaError(true);
      setErrorMsg('请输入验证码');
      return;
    }

    login.mutate({
      username: cleanUsername,
      password,
      uuid: captchaEnabled ? captcha?.uuid : undefined,
      captcha: captchaEnabled ? captchaCode.trim() : undefined,
    });
  };

  const onGoogleLogin = async () => {
    setErrorMsg('');
    try {
      const url = await getGoogleOauth2Url();
      if (url) window.location.href = url;
    } catch {
      setErrorMsg('Google 登录暂不可用，请稍后重试');
    }
  };

  return (
    <div className="right-panel">
      <div className="form-container">
        <div className="form-header">
          <h1>{mode === 'login' ? '登录' : '创建账号'}</h1>
        </div>

        {successMsg ? (
          <div className="success-msg show">{successMsg}</div>
        ) : null}
        {errorMsg ? <div className="error-msg show">{errorMsg}</div> : null}

        {mode === 'register' ? (
          <RegisterForm
            onSuccess={() => {
              switchMode('login');
              setSuccessMsg('注册成功，请登录');
            }}
          />
        ) : (
          <form onSubmit={onSubmit}>
            <div className="form-group">
              <label
                htmlFor="username"
                className={usernameError ? 'error-label' : ''}
              >
                用户名
              </label>
              <div className="input-wrapper">
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(event) => {
                    setUsername(event.target.value);
                    if (usernameError) setUsernameError(false);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder="请输入用户名"
                  autoComplete="username"
                  className={usernameError ? 'error' : ''}
                />
              </div>
            </div>

            <div className="form-group">
              <label
                htmlFor="password"
                className={passwordError ? 'error-label' : ''}
              >
                密码
              </label>
              <div className="input-wrapper">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (passwordError) setPasswordError(false);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder="请输入密码"
                  autoComplete="current-password"
                  className={passwordError ? 'error' : ''}
                />
                <button
                  type="button"
                  className="toggle-password"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  <EyeIcon show={showPassword} />
                </button>
              </div>
            </div>

            {captchaEnabled ? (
              <div className="captcha-row">
                <div className="form-group">
                  <label
                    htmlFor="captcha"
                    className={captchaError ? 'error-label' : ''}
                  >
                    验证码
                  </label>
                  <div className="input-wrapper">
                    <input
                      id="captcha"
                      type="text"
                      value={captchaCode}
                      onChange={(event) => {
                        setCaptchaCode(event.target.value);
                        if (captchaError) setCaptchaError(false);
                      }}
                      placeholder="请输入验证码"
                      autoComplete="off"
                      className={captchaError ? 'error' : ''}
                    />
                  </div>
                </div>
                {captcha?.image ? (
                  <button
                    type="button"
                    className="captcha-img-wrap"
                    onClick={refreshCaptcha}
                    title="点击刷新验证码"
                    aria-label="刷新验证码"
                  >
                    <img
                      className="captcha-img"
                      src={
                        captcha.image.startsWith('data:')
                          ? captcha.image
                          : `data:image/png;base64,${captcha.image}`
                      }
                      alt="验证码"
                    />
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className="form-options mt-4 mb-4">
              <label className="remember-me">
                <input type="checkbox" defaultChecked /> 30 日免登录
              </label>
              <button type="button" className="forgot-link">
                忘记密码？
              </button>
            </div>

            <button
              type="submit"
              className="btn-login"
              disabled={login.isPending}
            >
              <span className="btn-text">
                {login.isPending ? '登录中…' : '登录'}
              </span>
            </button>

            <button
              type="button"
              className="btn-google mb-4"
              onClick={onGoogleLogin}
              disabled={login.isPending}
            >
              <span className="btn-text">
                <svg className="google-icon" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="var(--brand-google-blue)"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="var(--brand-google-green)"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 001 12c0 1.94.46 3.77 1.18 5.07l3.66-2.84v-.14z"
                    fill="var(--brand-google-yellow)"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="var(--brand-google-red)"
                  />
                </svg>
                Log in with Google
              </span>
            </button>
          </form>
        )}

        <div className="signup-link">
          {mode === 'login' ? (
            <span>
              还没有账号？{' '}
              <button
                type="button"
                className="link-btn"
                onClick={() => switchMode('register')}
              >
                立即注册
              </button>
            </span>
          ) : (
            <span>
              已有账号？{' '}
              <button
                type="button"
                className="link-btn"
                onClick={() => switchMode('login')}
              >
                去登录
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default AuthFormPanel;
