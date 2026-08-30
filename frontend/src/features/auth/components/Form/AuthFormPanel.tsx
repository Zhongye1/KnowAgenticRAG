import { useState } from 'react';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

import './index.css';

function AuthFormPanel() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [emailError, setEmailError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);

  const onSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setEmailError(false);
    setPasswordError(false);
    setErrorMsg('');

    const cleanEmail = email.trim();

    if (!cleanEmail || !EMAIL_REGEX.test(cleanEmail)) {
      setEmailError(true);
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    if (!password || password.length < 6) {
      setPasswordError(true);
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    setPasswordError(true);
    setErrorMsg('Invalid email or password. Please try again.');
  };

  return (
    <div className="right-panel">
      <div className="form-container">
        <div className="form-header">
          <h1>登录</h1>
        </div>

        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label htmlFor="email" className={emailError ? 'error-label' : ''}>
              Email
            </label>
            <div className="input-wrapper">
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (emailError) setEmailError(false);
                  if (errorMsg) setErrorMsg('');
                }}

                placeholder="you@example.com"
                autoComplete="off"
                className={emailError ? 'error' : ''}
              />
            </div>
          </div>

          <div className="form-group">
            <label
              htmlFor="password"
              className={passwordError ? 'error-label' : ''}
            >
              Password
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

                placeholder="********"
                className={passwordError ? 'error' : ''}
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? (
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
                )}
              </button>
            </div>
          </div>

          <div className="form-options">
            <label className="remember-me">
              <input type="checkbox" defaultChecked /> 30 日免登录
            </label>
            <a href="#" className="forgot-link">
              Forgot password?
            </a>
          </div>

          {errorMsg ? <div className="error-msg show">{errorMsg}</div> : null}

          <button type="submit" className="btn-login">
            <span className="btn-text">Log In</span>
          </button>

          <button type="button" className="btn-google">
            <span className="btn-text">
              <svg className="google-icon" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 001 12c0 1.94.46 3.77 1.18 5.07l3.66-2.84v-.14z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Log in with Google
            </span>
          </button>
        </form>

        <div className="signup-link">
          Don&apos;t have an account? <a href="#">Sign Up</a>
        </div>
      </div>
    </div>
  );
}

export default AuthFormPanel;
