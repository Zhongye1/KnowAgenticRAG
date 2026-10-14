/**
 * 会话详情抽屉：会话元信息 + 消息时间线 + 每条消息的工具执行记录。
 *
 * `messages[].tool_calls` 由后端 `ars/services/dashboard_service.py` 组装（工具名、入参、
 * 出参、状态、错误原因）；`/stats/tools` 的聚合不能替代这里的单条审计。
 */
import { Bot, Cpu, User, Wrench } from 'lucide-react';

import type { ToolCallRecord } from '../api/dashboard-api';
import { formatFullDateTime } from '../lib/dashboard-format';
import { conversationStatusLabel } from '../lib/conversation-query';
import { useConversationDetail } from '../model/dashboard-queries';
import { PanelBody } from './panel-card';
import { Drawer } from 'antd';

const ROLE_LABELS: Record<string, string> = {
  user: '用户',
  assistant: '智能体',
  tool: '工具返回',
  system: '系统提示',
};

const ROLE_ICONS = {
  user: User,
  assistant: Bot,
  tool: Wrench,
  system: Cpu,
} as const;

const ROLE_BADGE_CLASSES: Record<string, string> = {
  user: 'bg-link-1 text-link-7',
  assistant: 'bg-primary-1 text-primary-6',
  tool: 'bg-warning-1 text-warning-7',
  system: 'bg-color-fill-2 text-color-text-3',
};

export const roleLabel = (role: string): string => ROLE_LABELS[role] ?? role;

export type ThreadDetailDrawerProps = {
  threadId: string | null;
  onOpenChange: (open: boolean) => void;
};

/** 工具调用的入参/出参展示：对象转 JSON，字符串原样。 */
const formatToolPayload = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

/** 单条消息的工具执行记录；折叠区默认收起。 */
const ToolCallList = ({ calls }: { calls: ToolCallRecord[] }) => (
  <details className="mt-2 rounded-medium border border-color-border-1 bg-color-bg-2">
    <summary className="flex cursor-pointer items-center gap-1.5 px-2 py-1.5 text-[11px] text-color-text-3">
      <Wrench className="size-3" aria-hidden />
      工具执行记录（{calls.length}）
    </summary>
    <ul
      className="flex flex-col gap-2 px-2 pt-1 pb-2"
      data-testid="thread-tool-calls"
    >
      {calls.map((call) => (
        <li key={call.id} className="text-[11px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-color-text-2">
              {call.tool_name}
            </span>
            <span
              className={
                call.status === 'success'
                  ? 'rounded-full bg-success-1 px-1.5 text-success-7'
                  : 'rounded-full bg-danger-1 px-1.5 text-danger-7'
              }
            >
              {call.status === 'success'
                ? '成功'
                : call.status === 'error'
                  ? '失败'
                  : call.status || '未知'}
            </span>
          </div>
          {call.error_message ? (
            <p className="mt-1 text-danger-7">{call.error_message}</p>
          ) : null}
          {formatToolPayload(call.tool_input) ? (
            <pre className="mt-1 max-h-32 overflow-auto rounded-small bg-color-bg-1 p-1.5 whitespace-pre-wrap text-color-text-3">
              {formatToolPayload(call.tool_input)}
            </pre>
          ) : null}
          {formatToolPayload(call.tool_output) ? (
            <pre className="mt-1 max-h-32 overflow-auto rounded-small bg-color-bg-1 p-1.5 whitespace-pre-wrap text-color-text-3">
              {formatToolPayload(call.tool_output)}
            </pre>
          ) : null}
        </li>
      ))}
    </ul>
  </details>
);

export const ThreadDetailDrawer = ({
  threadId,
  onOpenChange,
}: ThreadDetailDrawerProps) => {
  const detail = useConversationDetail(threadId);
  const data = detail.data;

  return (
    <Drawer
      open={Boolean(threadId)}
      onClose={() => onOpenChange(false)}
      width={720}
      styles={{
        body: { padding: 0, display: 'flex', flexDirection: 'column' },
      }}
      rootClassName="[&_.ant-drawer-header]:border-b [&_.ant-drawer-header]:border-color-border-1"
      data-testid="thread-detail-drawer"
      title={
        <div>
          <div className="truncate">{data?.title || '会话详情与交互审计'}</div>
          <div className="text-xs font-normal text-color-text-3">
            {data
              ? `${conversationStatusLabel(data.status)} · ${data.message_count} 条消息`
              : '按交互顺序展示该会话的消息流水。'}
          </div>
        </div>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <PanelBody
          loading={detail.isPending}
          error={detail.isError}
          onRetry={() => void detail.refetch()}
          errorText="会话详情加载失败。"
          height={240}
          testId="thread-detail"
        >
          {data ? (
            <div className="flex flex-col gap-4">
              <dl className="grid grid-cols-2 gap-3 rounded-large border border-color-border-1 bg-color-bg-2 p-3 text-xs md:grid-cols-3">
                <div className="min-w-0">
                  <dt className="text-[11px] text-color-text-3">Thread ID</dt>
                  <dd
                    className="truncate font-mono text-[11px] text-color-text-2"
                    title={data.thread_id}
                  >
                    {data.thread_id}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[11px] text-color-text-3">所属智能体</dt>
                  <dd
                    className="truncate text-color-text-1"
                    title={data.agent_id}
                  >
                    {data.agent_name || data.agent_id}
                    {data.agent_deleted ? '（已删除）' : ''}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[11px] text-color-text-3">所属用户</dt>
                  <dd className="truncate text-color-text-1" title={data.uid}>
                    {data.username || data.uid}
                    {data.user_deleted ? '（已注销）' : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-color-text-3">消息总数</dt>
                  <dd className="tabular-nums text-color-text-1">
                    {data.message_count} 条
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-color-text-3">Token 消耗</dt>
                  <dd className="tabular-nums text-color-text-1">
                    {Number(data.total_tokens ?? 0).toLocaleString('zh-CN')}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-color-text-3">更新时间</dt>
                  <dd className="text-color-text-1">
                    {formatFullDateTime(data.updated_at)}
                  </dd>
                </div>
              </dl>

              <h4 className="text-sm font-semibold text-color-text-1">
                消息时间线（{data.messages?.length ?? 0}）
              </h4>

              {(data.messages ?? []).length === 0 ? (
                <p className="py-8 text-center text-xs text-color-text-3">
                  该会话尚无消息记录。
                </p>
              ) : (
                <ol
                  className="flex flex-col gap-3"
                  data-testid="thread-message-list"
                >
                  {(data.messages ?? []).map((message) => {
                    const Icon =
                      ROLE_ICONS[message.role as keyof typeof ROLE_ICONS] ??
                      Cpu;
                    return (
                      <li
                        key={message.id}
                        data-testid="thread-message"
                        className="rounded-large border border-color-border-1 bg-color-bg-1 p-3"
                      >
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex size-6 items-center justify-center rounded-medium ${
                              ROLE_BADGE_CLASSES[message.role] ??
                              ROLE_BADGE_CLASSES.system
                            }`}
                          >
                            <Icon className="size-3.5" aria-hidden />
                          </span>
                          <span className="text-[13px] font-semibold text-color-text-1">
                            {roleLabel(message.role)}
                          </span>
                          <span className="text-[11px] text-color-text-3">
                            {formatFullDateTime(message.created_at)}
                          </span>
                          {message.token_count ? (
                            <span className="rounded-full bg-color-fill-2 px-2 py-0.5 text-[11px] text-color-text-3">
                              {message.token_count} tokens
                            </span>
                          ) : null}
                          {message.message_type &&
                          message.message_type !== 'text' ? (
                            <span className="rounded-full bg-link-1 px-2 py-0.5 text-[11px] text-link-7">
                              {message.message_type}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[13px] leading-relaxed break-words whitespace-pre-wrap text-color-text-2">
                          {message.content}
                        </p>
                        {message.tool_calls?.length ? (
                          <ToolCallList calls={message.tool_calls} />
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          ) : null}
        </PanelBody>
      </div>
    </Drawer>
  );
};
