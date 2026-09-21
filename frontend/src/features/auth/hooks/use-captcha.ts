import { useCallback, useState } from 'react';

import { useGetCaptcha } from '@/generated/auth/get-captcha';

/** 接口可能返回裸 base64，也可能返回完整 data URL。 */
function toImageSrc(image?: string | null): string {
  if (!image) return '';
  return image.startsWith('data:') ? image : `data:image/png;base64,${image}`;
}

/**
 * 验证码加载 / 重试。
 *
 * 服务端状态交给生成的 TanStack Query hook（缓存、去重、重试都由 react-query 负责），
 * 并把两类失败统一成可重试的 `isFailed`：请求失败、图片为空或解码失败。
 *
 * 之前是手写 effect + `.catch(() => setCaptcha(null))`：失败后整块验证码不渲染，
 * 刷新入口（那张图）也一起消失，用户只能停在「一提交就报错」的状态里。
 */
export function useCaptcha({ enabled = true }: { enabled?: boolean } = {}) {
  const { data, isPending, isFetching, isError, refetch } = useGetCaptcha({
    queryConfig: {
      enabled,
      // 全局 retry:false，验证码这类偶发失败单独放开一次自动重试
      retry: 1,
      retryDelay: 500,
    },
  });

  const [code, setCode] = useState('');
  const [imageBroken, setImageBroken] = useState(false);

  const refresh = useCallback(() => {
    setCode('');
    setImageBroken(false);
    void refetch();
  }, [refetch]);

  const isEnabled = Boolean(data?.is_enabled);
  const imageSrc = imageBroken ? '' : toImageSrc(data?.image);
  // 服务端说启用了验证码，却没给图，同样按失败处理
  const isFailed = isError || imageBroken || (isEnabled && !imageSrc);
  const isLoading = !isFailed && !imageSrc && (isPending || isFetching);

  return {
    isEnabled,
    /** 加载失败时也要展示：否则既没有原因，也没有重试入口 */
    isVisible: isEnabled || isFailed,
    uuid: data?.uuid,
    code,
    setCode,
    imageSrc,
    onImageError: () => setImageBroken(true),
    isLoading,
    isFailed,
    refresh,
  };
}
