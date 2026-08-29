import {
  IconEmail,
  IconInfoCircle,
  IconQq,
  IconUser,
  IconWechat,
} from '@arco-design/web-react/icon';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { paths } from '@/config/paths';
import { setAccessToken } from '@/lib/api-client';

import { LoginForm } from './login-form';
import { OAuthPanel } from './oauth-panel';
import { QrLoginPanel } from './qr-login-panel';
import { RegisterForm } from './register-form';

type Method = 'password' | 'qqmail' | 'qq' | 'wechat';
type Mode = 'login' | 'register';

const TABS: { key: Method; label: string; icon: React.ReactNode }[] = [
  {
    key: 'password',
    label: '账号密码',
    icon: <IconUser className="h-4 w-4" />,
  },
  { key: 'qqmail', label: 'QQ邮箱', icon: <IconEmail className="h-4 w-4" /> },
  { key: 'qq', label: 'QQ登录', icon: <IconQq className="h-4 w-4" /> },
  {
    key: 'wechat',
    label: '微信登录',
    icon: <IconWechat className="h-4 w-4" />,
  },
];

const MODES: { key: Mode; label: string }[] = [
  { key: 'login', label: '登录' },
  { key: 'register', label: '注册' },
];

/**
 * 登录卡片。
 * 默认「账号密码」Tab（当前后端唯一可用登录方式）；
 * 扫码 / QQ / 微信接口后端尚未实现，面板内展示占位。
 * 登录与注册在同一张卡片内切换。
 */
export function LoginCard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirectTo');

  const [mode, setMode] = useState<Mode>('login');
  const [method, setMethod] = useState<Method>('password');
  const [autoLogin, setAutoLogin] = useState(false);

  const goApp = () => {
    navigate(redirectTo || paths.app.dashboard.getHref());
  };

  return (
    <div className="w-[400px] rounded-2xl bg-white shadow-lg ring-1 ring-gray-100">
      {/* 登录 / 注册切换 */}
      <div className="flex border-b border-gray-100 px-4 pt-3">
        {MODES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={`flex items-center gap-1.5 rounded-t-lg px-4 py-2.5 text-sm transition ${
              mode === key
                ? 'border-b-2 border-blue-500 font-medium text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'register' ? (
        /* 注册面板 */
        <div className="px-8 py-6">
          <RegisterForm onSuccess={() => setMode('login')} />
        </div>
      ) : (
        <>
          {/* 登录方式 Tab 栏 */}
          <div className="flex border-b border-gray-100 px-4">
            {TABS.map(({ key, label, icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setMethod(key)}
                className={`flex items-center gap-1.5 rounded-t-lg px-4 py-2.5 text-sm transition ${
                  method === key
                    ? 'border-b-2 border-blue-500 font-medium text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          {/* 登录面板区 */}
          <div className="px-8 pb-2">
            {method === 'password' && <LoginForm onSuccess={goApp} />}
            {method === 'qqmail' && (
              <QrLoginPanel
                onConfirmed={(token) => {
                  setAccessToken(token.access_token);
                  goApp();
                }}
              />
            )}
            {method === 'qq' && <OAuthPanel provider="qq" name="QQ" />}
            {method === 'wechat' && (
              <OAuthPanel provider="wechat" name="微信" />
            )}
          </div>
        </>
      )}

      {/* 底栏 */}
      <div className="flex items-center justify-center gap-6 border-t border-gray-50 py-4 text-xs text-gray-500">
        {mode === 'login' && (
          <label className="flex cursor-pointer select-none items-center gap-1.5">
            <input
              type="checkbox"
              checked={autoLogin}
              onChange={(e) => setAutoLogin(e.target.checked)}
              className="h-3.5 w-3.5 accent-blue-500"
            />
            下次自动登录
          </label>
        )}
        <a href="/help" className="flex items-center gap-1 hover:text-gray-700">
          <IconInfoCircle className="h-3.5 w-3.5" /> 帮助
        </a>
      </div>
    </div>
  );
}
