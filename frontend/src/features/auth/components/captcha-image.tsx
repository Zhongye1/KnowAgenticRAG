import { RefreshCw } from 'lucide-react';

import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

import './Form/index.css';

type CaptchaImageProps = {
  imageSrc: string;
  isLoading: boolean;
  isFailed: boolean;
  onRefresh: () => void;
  onImageError: () => void;
  alt?: string;
  className?: string;
};

/**
 * 验证码图片位，三态：就绪 / 加载中 / 失败可重试。
 *
 * 失败态必须留一个可点击入口 —— 之前请求挂了整块验证码直接不渲染，
 * 刷新按钮（就是这张图）也一起消失，用户没有任何重试手段。
 */
export function CaptchaImage({
  imageSrc,
  isLoading,
  isFailed,
  onRefresh,
  onImageError,
  alt = '验证码',
  className,
}: CaptchaImageProps) {
  if (imageSrc) {
    return (
      <button
        type="button"
        className={cn('captcha-img-wrap', className)}
        onClick={onRefresh}
        title="点击刷新验证码"
        aria-label="刷新验证码"
      >
        <img
          className="captcha-img"
          src={imageSrc}
          alt={alt}
          onError={onImageError}
        />
      </button>
    );
  }

  if (isFailed) {
    return (
      <button
        type="button"
        className={cn('captcha-img-wrap', className)}
        onClick={onRefresh}
        title="验证码加载失败，点击重试"
        aria-label="验证码加载失败，点击重试"
      >
        <span className="captcha-img-state captcha-img-state-error">
          <RefreshCw className="size-4" aria-hidden="true" />
          点击重试
        </span>
      </button>
    );
  }

  if (isLoading) {
    return (
      <span className={cn('captcha-img-state', className)} aria-hidden="true">
        <Spinner size="sm" />
      </span>
    );
  }

  return null;
}
