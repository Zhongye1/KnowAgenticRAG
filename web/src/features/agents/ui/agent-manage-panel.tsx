/**
 * 智能体管理面板。
 *
 * 工具栏（搜索 + 新增智能体 + 刷新）+「智能体 / 子智能体」两组卡片。数据、写入与失效都走
 * `entities/agent`；统计芯片在页头（与参照一致），面板不再自己渲染一行统计。
 *
 * 「去对话」由页面接线（面板不依赖对话切片），授权边界在后端（`user_can_manage_agent`）。
 */
import * as React from 'react';
import { Plus, RefreshCw, Search } from 'lucide-react';

import { Button, Empty, Input, Spin } from 'antd';
import type { Agent } from '@/entities/agent';
import {
  useAgentBackends,
  useAgents,
  useCreateAgent,
  useRemoveAgent,
  useUpdateAgent,
} from '@/entities/agent';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { useNotifications } from '@/shared/ui/notifications';

import {
  buildAgentCreatePayload,
  buildAgentUpdatePayload,
  type AgentForm,
} from '../lib/agent-form';
import { filterAgents, groupAgents } from '../lib/agent-view';
import { AgentCard } from './agent-card';
import { AgentFormDialog } from './agent-form-dialog';

export type AgentManagePanelProps = {
  /** 用某个智能体开一段新对话。 */
  onOpenChat: (agent: Agent) => void;
};

/** 对话框的目标：未打开 / 新建 / 编辑某一条。 */
type DialogTarget = Agent | 'new' | null;

export const AgentManagePanel = ({ onOpenChat }: AgentManagePanelProps) => {
  // 管理面板要连子智能体一起看，按组展示
  const { agents, isLoading, isFetching, error, refetch } = useAgents(true);
  const backends = useAgentBackends();
  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent();
  const removeAgent = useRemoveAgent();
  const { confirm } = useConfirm();
  const notifications = useNotifications();

  const [keyword, setKeyword] = React.useState('');
  const [target, setTarget] = React.useState<DialogTarget>(null);

  const groups = groupAgents(filterAgents(agents, keyword));
  const saving = createAgent.isPending || updateAgent.isPending;

  const notifySuccess = (message: string) =>
    notifications.addNotification({
      type: 'success',
      title: '智能体',
      message,
    });
  const notifyError = (message: string) =>
    notifications.addNotification({ type: 'error', title: '智能体', message });

  /** 提交表单；返回错误文案时对话框内联显示，成功返回 null。 */
  const submit = async (form: AgentForm): Promise<string | null> => {
    try {
      if (target === 'new') {
        await createAgent.mutateAsync(buildAgentCreatePayload(form));
        notifySuccess('智能体已创建。');
      } else if (target) {
        await updateAgent.mutateAsync({
          slug: target.slug,
          payload: buildAgentUpdatePayload(form),
        });
        notifySuccess('智能体已保存。');
      }
      setTarget(null);
      return null;
    } catch (submitError) {
      return submitError instanceof Error
        ? submitError.message
        : '保存智能体失败。';
    }
  };

  const remove = async (agent: Agent) => {
    const confirmed = await confirm({
      title: `删除 ${agent.name}`,
      description:
        '删除后不可恢复，已绑定该智能体的历史对话仍保留原始绑定信息。',
      confirmText: '删除',
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await removeAgent.mutateAsync(agent.slug);
      notifySuccess('智能体已删除。');
    } catch (removeError) {
      notifyError(
        removeError instanceof Error ? removeError.message : '删除智能体失败。',
      );
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* antd reset 在 base 层压过了组件层的 color/font（按钮文字继承 body 深色、
          输入框继承 16px 行高），这里用工具类显式闭合：主按钮白字，输入框对齐
          按钮的 32px 控件高度、上限 33vw，新增按钮 ml-auto 连同刷新一起靠右 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-[33vw] sm:w-auto sm:flex-1">
          {/* z-10：图标是绝对定位的兄弟节点，会被后绘的不透明输入框盖住 */}
          <Search
            className="pointer-events-none absolute top-1/2 left-2 z-10 size-4 -translate-y-1/2 text-color-text-3"
            aria-hidden
          />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索智能体…"
            aria-label="搜索智能体"
            className="h-8 pl-8 leading-8"
          />
        </div>
        <Button
          htmlType="button"
          type="primary"
          icon={<Plus className="size-4" aria-hidden />}
          /* shadow-none：antd 非线框主按钮自带的 2px 底部投影不要 */
          className="ml-auto text-color-white shadow-none"
          onClick={() => setTarget('new')}
        >
          新增智能体
        </Button>
        <Button
          htmlType="button"
          type="text"
          size="small"
          aria-label="刷新智能体列表"
          onClick={refetch}
        >
          <RefreshCw
            className={`size-4 ${isFetching ? 'animate-spin' : ''}`}
            aria-hidden
          />
        </Button>
      </div>

      {isLoading ? (
        <p className="flex items-center gap-2 py-8 text-sm text-color-text-3">
          <Spin aria-hidden className="size-4" />
          正在加载智能体…
        </p>
      ) : null}

      {error ? (
        <div className="flex flex-col items-start gap-2 py-6">
          <p role="alert" className="text-sm text-danger-6">
            {error instanceof Error ? error.message : '加载智能体失败。'}
          </p>
          <Button
            htmlType="button"
            variant="outlined"
            size="small"
            onClick={refetch}
          >
            重试
          </Button>
        </div>
      ) : null}

      {!isLoading && !error && groups.length === 0 ? (
        <Empty description={keyword ? '没有匹配的智能体' : '暂无智能体'} />
      ) : null}

      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-color-text-2">
            {group.title}
          </h2>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
            {group.agents.map((agent) => (
              <AgentCard
                key={agent.slug}
                agent={agent}
                onOpenChat={onOpenChat}
                onEdit={setTarget}
                onDelete={(item) => void remove(item)}
              />
            ))}
          </div>
        </section>
      ))}

      {target ? (
        <AgentFormDialog
          agent={target === 'new' ? null : target}
          backends={backends.backends}
          saving={saving}
          onOpenChange={(open) => {
            if (!open) setTarget(null);
          }}
          onSubmit={submit}
        />
      ) : null}
    </div>
  );
};
