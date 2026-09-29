import { AlertTriangle, FileText } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * 预览外壳与状态块（kb 落地改造清单 Phase 3 / D55）。
 *
 * 统一给所有 viewer 提供一致的边框、尺寸与三种非内容态（转换中 / 降级 / 不可预览），
 * 避免每个 viewer 各写一套。
 */

export const PreviewFrame = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      'h-[45vh] min-h-64 w-full overflow-hidden rounded-large border border-color-border-2 bg-color-bg-1',
      className,
    )}
  >
    {children}
  </div>
);

export const PreviewCentered = ({
  icon,
  title,
  hint,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
}) => (
  <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground">
    {icon ?? <FileText className="size-5 opacity-60" aria-hidden="true" />}
    <p className="text-xs">{title}</p>
    {hint ? <p className="text-[11px] opacity-80">{hint}</p> : null}
  </div>
);

/**
 * 降级提示（D55.3）：Office 转换失败时后端退回解析产物 Markdown，
 * 这里如实告知用户「看到的不是原版式」，而不是静默假装正常。
 */
export const DegradedNotice = ({ reason }: { reason?: string | null }) => (
  <div className="flex items-start gap-2 rounded-large border border-color-border-2 bg-color-bg-2 px-3 py-2 text-[11px] text-muted-foreground">
    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
    <span>
      原始版式转换不可用，已降级为解析文本预览。
      {reason ? <span className="opacity-70">（{reason}）</span> : null}
    </span>
  </div>
);
