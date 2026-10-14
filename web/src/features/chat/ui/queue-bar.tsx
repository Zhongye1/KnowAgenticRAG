/**
 * 线程队列条。
 *
 * 普通请求按 FIFO 串行派发，队头之前的请求都还在排队；队列被暂停时
 * 后端不会自动继续，需要用户显式「继续」。展示与可用性判断都来自
 * `describeQueue`，组件只负责把动作转发回运行时。
 */
import { describeQueueRow } from '../lib/queue-view';
import type { QueueRowContext, QueueView } from '../lib/queue-view';
import type { ThreadRequest } from '../api/agent-api';
import { Button } from 'antd';

type QueueBarProps = {
  view: QueueView;
  requests: ThreadRequest[];
  /** 行级动作判定所需的线程状态。 */
  rowContext: QueueRowContext;
  /** 线程正在等待用户回答或审批，此时后续请求只能排队。 */
  waitingForUserAction: boolean;
  /** 手动继续队列进行中，用于禁用按钮避免重复提交。 */
  continuing: boolean;
  disabled?: boolean;
  onSteer: (requestId: string) => void;
  onCancel: (requestId: string) => void;
  onContinue: () => void;
};

export const QueueBar = ({
  view,
  requests,
  rowContext,
  waitingForUserAction,
  continuing,
  disabled = false,
  onSteer,
  onCancel,
  onContinue,
}: QueueBarProps) => {
  if (!view.visible) return null;

  return (
    <section
      className="flex flex-col gap-2 rounded-large border border-[var(--gray-150)] bg-[var(--gray-0)] p-3"
      aria-label="排队中的请求"
    >
      <header className="flex items-center justify-between gap-2">
        <span className="text-xs text-[var(--gray-500)]">
          排队中 {view.pendingCount} 条
          {view.pausedReason ? ` · 已暂停：${view.pausedReason}` : ''}
        </span>
        {view.paused ? (
          <Button
            variant="outlined"
            disabled={disabled || continuing || !view.canContinue}
            onClick={onContinue}
          >
            {continuing ? '正在继续…' : '继续队列'}
          </Button>
        ) : null}
      </header>

      {waitingForUserAction ? (
        <p className="text-xs text-[var(--gray-500)]">
          当前任务正在等待回答或审批，完成后将继续处理后续请求。
        </p>
      ) : null}

      <ul className="flex flex-col gap-1">
        {requests.map((request) => {
          const actions = describeQueueRow(request, rowContext);
          return (
            <li
              key={request.request_id}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="truncate text-[var(--gray-800)]">
                {request.queue_position ? `${request.queue_position}. ` : ''}
                {request.content || '排队请求'}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {request.queue_policy === 'steer' ? (
                  <span className="text-xs text-[var(--gray-500)]">
                    引导 · 下一条执行
                  </span>
                ) : null}
                {actions.canSteer ? (
                  <Button
                    type="text"
                    size="small"
                    disabled={disabled}
                    onClick={() => onSteer(request.request_id)}
                  >
                    引导
                  </Button>
                ) : null}
                {actions.canCancel ? (
                  <Button
                    type="text"
                    size="small"
                    disabled={disabled}
                    aria-label={`删除排队请求：${request.content || '排队请求'}`}
                    onClick={() => onCancel(request.request_id)}
                  >
                    取消
                  </Button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
