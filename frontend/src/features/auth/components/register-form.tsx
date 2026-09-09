import { useCallback, useEffect, useState } from 'react';

import { getCaptcha } from '@/generated/auth/get-captcha';
import type { GetCaptchaDetail } from '@/generated/types';
import { useRegister } from '@/lib/auth';

import { getErrorMessage } from '../api/errors';
import './Form/index.css';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RegisterFormProps = {
  onSuccess?: () => void;
};

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

export function RegisterForm({ onSuccess }: RegisterFormProps) {
  const [username, setUsername] = useState('');
  // const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [captcha, setCaptcha] = useState<GetCaptchaDetail | null>(null);
  const [captchaCode, setCaptchaCode] = useState('');
  const [captchaRefresh, setCaptchaRefresh] = useState(0);

  const [errorMsg, setErrorMsg] = useState('');
  const [usernameError, setUsernameError] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [confirmError, setConfirmError] = useState(false);
  const [captchaError, setCaptchaError] = useState(false);

  useEffect(() => {
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
  }, [captchaRefresh]);

  const refreshCaptcha = useCallback(() => {
    setCaptchaCode('');
    setCaptchaRefresh((prev) => prev + 1);
  }, []);

  const captchaEnabled = Boolean(captcha?.is_enabled);
  const captchaImageSrc = captcha?.image
    ? captcha.image.startsWith('data:')
      ? captcha.image
      : `data:image/png;base64,${captcha.image}`
    : '';

  const register = useRegister({
    onSuccess: () => onSuccess?.(),
    onError: (error) => {
      setErrorMsg(getErrorMessage(error, '注册失败，请稍后重试'));
      if (captchaEnabled) refreshCaptcha();
    },
  });

  const onSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setUsernameError(false);
    setEmailError(false);
    setPasswordError(false);
    setConfirmError(false);
    setCaptchaError(false);
    setErrorMsg('');

    const cleanUsername = username.trim();
    const cleanEmail = email.trim();

    if (!cleanUsername) {
      setUsernameError(true);
      setErrorMsg('请输入用户名');
      return;
    }

    if (password.length < 6) {
      setPasswordError(true);
      setErrorMsg('密码至少 6 位');
      return;
    }

    if (confirmPassword !== password) {
      setConfirmError(true);
      setErrorMsg('两次输入的密码不一致');
      return;
    }

    if (cleanEmail && !EMAIL_REGEX.test(cleanEmail)) {
      setEmailError(true);
      setErrorMsg('请输入有效的邮箱地址');
      return;
    }

    if (captchaEnabled && !captchaCode.trim()) {
      setCaptchaError(true);
      setErrorMsg('请输入验证码');
      return;
    }

    register.mutate({
      username: cleanUsername,
      password,
      // nickname: nickname.trim() || undefined,
      email: cleanEmail || undefined,
      uuid: captchaEnabled ? captcha?.uuid : undefined,
      captcha: captchaEnabled ? captchaCode.trim() : undefined,
    });
  };

  return (
    <form onSubmit={onSubmit}>
      <div className="form-group">
        <label
          htmlFor="reg-username"
          className={usernameError ? 'error-label' : ''}
        >
          用户名
        </label>
        <div className="input-wrapper">
          <input
            id="reg-username"
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

      {/* <div className="form-group">
        <label htmlFor="reg-nickname">昵称（选填）</label>
        <div className="input-wrapper">
          <input
            id="reg-nickname"
            type="text"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="如何称呼你？"
          />
        </div>
      </div> */}

      <div className="form-group">
        <label htmlFor="reg-email" className={emailError ? 'error-label' : ''}>
          邮箱（选填）
        </label>
        <div className="input-wrapper">
          <input
            id="reg-email"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (emailError) setEmailError(false);
              if (errorMsg) setErrorMsg('');
            }}
            placeholder="you@example.com"
            autoComplete="email"
            className={emailError ? 'error' : ''}
          />
        </div>
      </div>

      <div className="form-group">
        <label
          htmlFor="reg-password"
          className={passwordError ? 'error-label' : ''}
        >
          密码
        </label>
        <div className="input-wrapper">
          <input
            id="reg-password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (passwordError) setPasswordError(false);
              if (errorMsg) setErrorMsg('');
            }}
            placeholder="至少 6 位"
            autoComplete="new-password"
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

      <div className="form-group">
        <label
          htmlFor="reg-confirm"
          className={confirmError ? 'error-label' : ''}
        >
          确认密码
        </label>
        <div className="input-wrapper">
          <input
            id="reg-confirm"
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              if (confirmError) setConfirmError(false);
              if (errorMsg) setErrorMsg('');
            }}
            placeholder="再次输入密码"
            autoComplete="new-password"
            className={confirmError ? 'error' : ''}
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
              htmlFor="reg-captcha"
              className={captchaError ? 'error-label' : ''}
            >
              验证码
            </label>
            <div className="input-wrapper">
              <input
                id="reg-captcha"
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
          {captchaImageSrc ? (
            <button
              type="button"
              className="captcha-img-wrap"
              onClick={refreshCaptcha}
              title="点击刷新验证码"
              aria-label="刷新验证码"
            >
              <img className="captcha-img" src={captchaImageSrc} alt="验证码" />
            </button>
          ) : null}
        </div>
      ) : null}

      {errorMsg ? <div className="error-msg show">{errorMsg}</div> : null}
      <div className="h-4"></div>

      <button type="submit" className="btn-login" disabled={register.isPending}>
        <span className="btn-text">
          {register.isPending ? '注册中…' : '立即注册'}
        </span>
      </button>
    </form>
  );
}

export default RegisterForm;
