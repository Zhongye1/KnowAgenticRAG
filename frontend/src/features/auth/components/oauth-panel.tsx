import { IconQq, IconWechat } from '@arco-design/web-react/icon';
import { useState } from 'react';

import { BackendNotImplementedError, getOAuthUrl } from '../api/auth';

interface OAuthPanelProps {
  provider: 'qq' | 'wechat';
  name: string;
}

/**
 * OAuth 登录面板。
 * 后端未提供 QQ/微信 OAuth 时展示"开发中"占位。
 */
export function OAuthPanel({ provider, name }: OAuthPanelProps) {
  const [loading, setLoading] = useState(false);
  const [notImplemented, setNotImplemented] = useState(false);

  const start = async () => {
    setLoading(true);
    setNotImplemented(false);
    try {
      // 后端返回授权链接（含 state 防 CSRF），整页跳转
      const url = await getOAuthUrl(provider);
      window.location.href = url;
    } catch (e) {
      if (e instanceof BackendNotImplementedError) {
        setNotImplemented(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 py-10">
      {provider === 'qq' ? (
        <IconQq className="h-14 w-14 text-primary-6" />
      ) : (
        <IconWechat className="h-14 w-14 text-success-6" />
      )}
      <button
        type="button"
        onClick={start}
        disabled={loading}
        className="rounded-circle bg-primary-6 px-8 py-2 text-sm text-color-white transition hover:bg-primary-5 disabled:opacity-60"
      >
        {loading ? '跳转中…' : `使用${name}账号登录`}
      </button>
      {notImplemented ? (
        <p className="text-xs text-color-text-4">
          「{name}」登录暂未开放，敬请期待
        </p>
      ) : (
        <p className="text-xs text-color-text-4">
          将跳转到{name}授权页面完成登录
        </p>
      )}
    </div>
  );
}
