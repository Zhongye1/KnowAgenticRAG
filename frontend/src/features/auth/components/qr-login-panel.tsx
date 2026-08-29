import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react';

import { BackendNotImplementedError } from '../api/auth';
import {
  useQrLogin,
  type QrConfirmedToken,
} from '../hooks/use-qr-login';

interface QrLoginPanelProps {
  onConfirmed: (token: QrConfirmedToken) => void;
  appName?: string;
  minVersion?: string;
}

/**
 * 扫码登录面板。
 * 后端扫码接口未实现时会进入 error 态并渲染"开发中"占位。
 */
export function QrLoginPanel({
  onConfirmed,
  appName = 'KnowledgeRAG',
  minVersion = '7.1.0',
}: QrLoginPanelProps) {
  const { phase, qrImage, error, refresh } = useQrLogin(onConfirmed);

  const notImplemented = error instanceof BackendNotImplementedError;

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      {/* 二维码区：固定尺寸，状态浮层盖在上面 */}
      <div className="relative h-[180px] w-[180px] overflow-hidden rounded-lg border border-gray-100 p-3">
        {qrImage && (
          <img src={qrImage} alt="登录二维码" className="h-full w-full" />
        )}

        {/* 过期/加载/错误浮层 */}
        {(phase === 'expired' ||
          phase === 'loading' ||
          phase === 'error') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/95 text-sm text-gray-600">
            {phase === 'loading' && (
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            )}
            {phase === 'error' && notImplemented && (
              <>
                <span>扫码登录功能开发中，敬请期待</span>
                <span className="text-xs text-gray-400">
                  当前后端尚未提供扫码接口
                </span>
              </>
            )}
            {phase === 'error' && !notImplemented && (
              <>
                <span>加载失败</span>
                <button
                  type="button"
                  onClick={refresh}
                  className="flex items-center gap-1.5 rounded-full bg-blue-500 px-4 py-1.5 text-white transition hover:bg-blue-600"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> 点击刷新
                </button>
              </>
            )}
            {phase === 'expired' && (
              <>
                <span>二维码已失效</span>
                <button
                  type="button"
                  onClick={refresh}
                  className="flex items-center gap-1.5 rounded-full bg-blue-500 px-4 py-1.5 text-white transition hover:bg-blue-600"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> 点击刷新
                </button>
              </>
            )}
          </div>
        )}

        {/* 已扫描，等待确认 */}
        {phase === 'scanned' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/95 text-sm text-gray-700">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
            <span>扫描成功</span>
            <span className="text-xs text-gray-400">请在手机上确认登录</span>
          </div>
        )}
      </div>

      <p className="text-center text-sm leading-6 text-gray-600">
        使用「{appName}」App 扫一扫
        <br />
        需下载 {minVersion} 版本
      </p>
    </div>
  );
}
