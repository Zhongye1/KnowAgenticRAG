import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

import { useRegister } from '@/lib/auth';

import { getErrorMessage } from '../api/errors';
import { useCaptcha } from '../hooks/use-captcha';
import { CaptchaImage } from './captcha-image';
import './Form/index.css';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RegisterFormProps = {
  onSuccess?: () => void;
};

export function RegisterForm({ onSuccess }: RegisterFormProps) {
  const [username, setUsername] = useState('');
  // const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const captcha = useCaptcha();

  const [errorMsg, setErrorMsg] = useState('');
  const [usernameError, setUsernameError] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [confirmError, setConfirmError] = useState(false);
  const [captchaError, setCaptchaError] = useState(false);

  const register = useRegister({
    onSuccess: () => onSuccess?.(),
    onError: (error) => {
      setErrorMsg(getErrorMessage(error, '注册失败，请稍后重试'));
      if (captcha.isVisible) captcha.refresh();
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

    if (captcha.isEnabled && !captcha.code.trim()) {
      setCaptchaError(true);
      setErrorMsg('请输入验证码');
      return;
    }

    register.mutate({
      username: cleanUsername,
      password,
      // nickname: nickname.trim() || undefined,
      email: cleanEmail || undefined,
      uuid: captcha.isEnabled ? captcha.uuid : undefined,
      captcha: captcha.isEnabled ? captcha.code.trim() : undefined,
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
            {showPassword ? (
              <EyeOff size={20} aria-hidden="true" />
            ) : (
              <Eye size={20} aria-hidden="true" />
            )}
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
            {showPassword ? (
              <EyeOff size={20} aria-hidden="true" />
            ) : (
              <Eye size={20} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {captcha.isVisible ? (
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
                value={captcha.code}
                onChange={(event) => {
                  captcha.setCode(event.target.value);
                  if (captchaError) setCaptchaError(false);
                }}
                placeholder="请输入验证码"
                autoComplete="off"
                className={captchaError ? 'error' : ''}
              />
            </div>
          </div>
          <CaptchaImage
            imageSrc={captcha.imageSrc}
            isLoading={captcha.isLoading}
            isFailed={captcha.isFailed}
            onRefresh={captcha.refresh}
            onImageError={captcha.onImageError}
          />
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
