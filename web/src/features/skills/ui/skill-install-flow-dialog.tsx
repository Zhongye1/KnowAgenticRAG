/**
 * Skill 安装流弹窗。
 *
 * 单弹窗状态机 `selecting → preparing → reviewing → installing → result`；入口 `draft`（本地
 * 上传后直接确认）与 `remote`（先选来源与 Skill 再解析）。目标 `personal` / `shared`，共享
 * 要求 admin（后端 `get_admin_user`），共享设置走 `shared/ui/share-config-form.tsx`。
 *
 * 草稿是磁盘上的真实资源：取消、关闭与失败都要 `DELETE /api/skills/install-drafts/{id}`
 * 清掉，否则会留到过期；只有 `source_type === 'remote'` 的失败项能在弹窗里重试。
 */
import * as React from 'react';
import { LoaderCircle, PackageOpen, X, XCircle } from 'lucide-react';
import { Button, Spin } from 'antd';

import {
  skillApi,
  type SkillAccessLevel,
  type SkillDraft,
} from '../api/skill-api';
import {
  applyInstallResults,
  canCloseFlow,
  failWaitingItems,
  flattenDraftItems,
  initializeProgressItems,
  installTargetLabel,
  phaseStepIndex,
  readyReviewItems,
  resultTitle,
  retryRequests,
  setProgressStatus,
  STEP_LABELS,
  summarizeInstall,
  toInstallItems,
  PERSONAL_INSTALL_NOTE,
  type InstallItem,
  type InstallPhase,
  type InstallTarget,
  type ProgressItem,
  type RemoteRequest,
  type ReviewItem,
} from '../lib/install-flow';
import { useSkillShareTargets } from '../model/skill-queries';
import { useUser } from '@/entities/session';
import {
  normalizeShareConfig,
  validateShareConfig,
  type ShareConfig,
} from '@/shared/lib/share-config';
import { Modal } from 'antd';
import { ShareConfigForm } from '@/shared/ui/share-config-form';
import { cn } from '@/shared/lib';

import { InstallStatusList } from './install-status-list';
import { RemoteSkillPicker, useRemotePicker } from './remote-skill-picker';

/** 打开安装流的请求；`draft` 直接带草稿，`remote` 可以先带解析请求。 */
export type InstallFlowRequest =
  | { kind: 'draft'; title: string; description?: string; drafts: SkillDraft[] }
  | {
      kind: 'remote';
      title: string;
      description?: string;
      requests?: RemoteRequest[];
    };

type SkillInstallFlowDialogProps = {
  flow: InstallFlowRequest;
  onClose: () => void;
  onCompleted: (summary: { success: number; failed: number }) => void;
};

export const SkillInstallFlowDialog = ({
  flow,
  onClose,
  onCompleted,
}: SkillInstallFlowDialogProps) => {
  const user = useUser();
  const isAdmin =
    user.data?.role === 'admin' || user.data?.role === 'superadmin';
  const targets = useSkillShareTargets();
  const picker = useRemotePicker();

  const [phase, setPhase] = React.useState<InstallPhase>('selecting');
  const [drafts, setDrafts] = React.useState<SkillDraft[]>([]);
  const [reviewItems, setReviewItems] = React.useState<ReviewItem[]>([]);
  const [installItems, setInstallItems] = React.useState<InstallItem[]>([]);
  const [progressItems, setProgressItems] = React.useState<ProgressItem[]>([]);
  const [installTarget, setInstallTarget] =
    React.useState<InstallTarget>('personal');
  const [shareConfig, setShareConfig] = React.useState<ShareConfig>(() =>
    normalizeShareConfig(null),
  );
  const [allowedLevels, setAllowedLevels] = React.useState<SkillAccessLevel[]>([
    'user',
  ]);
  const [flowError, setFlowError] = React.useState('');

  const openReview = React.useCallback((payloads: SkillDraft[]) => {
    const usable = payloads.filter((draft) => draft?.draft_id);
    setDrafts(usable);
    setReviewItems(flattenDraftItems(usable));
    const first = usable[0];
    if (first) {
      setShareConfig(
        normalizeShareConfig(
          first.default_share_config,
          first.allowed_access_levels ?? ['user'],
        ),
      );
      setAllowedLevels(first.allowed_access_levels ?? ['user']);
    }
    setPhase('reviewing');
  }, []);

  const discardDrafts = React.useCallback(async (list: SkillDraft[]) => {
    await Promise.allSettled(
      list.map((draft) => skillApi.discardDraft(draft.draft_id)),
    );
  }, []);

  const prepareRequests = React.useCallback(
    async (requests: RemoteRequest[]) => {
      setPhase('preparing');
      setFlowError('');
      setDrafts([]);
      setProgressItems(initializeProgressItems(requests));
      const collected: SkillDraft[] = [];
      try {
        for (const request of requests) {
          setProgressItems((items) =>
            setProgressStatus(items, request.source, 'active'),
          );
          const draft = await skillApi.prepareRemote(request);
          if (draft?.draft_id) {
            collected.push(draft);
            setDrafts([...collected]);
          }
          setProgressItems((items) =>
            setProgressStatus(items, request.source, 'success'),
          );
        }
        if (!collected.length) throw new Error('没有可安装的 Skill');
        openReview(collected);
      } catch (error) {
        // 已经生成的草稿要清掉，否则留在磁盘上直到过期
        await discardDrafts(collected);
        const message =
          error instanceof Error ? error.message : '加载 Skill 失败';
        setFlowError(message);
        setProgressItems((items) =>
          items.map((item) =>
            item.status === 'success'
              ? item
              : { ...item, status: 'failed' as const },
          ),
        );
      }
    },
    [discardDrafts, openReview],
  );

  // 打开 / 换请求时重置状态。flow 是每次打开新建的对象，这里按它初始化并启动加载；
  // 挂载时按 props 初始化属于「初始化」而不是「同步外部系统」，effect + setState 是必要的
  /* oxlint-disable react/set-state-in-effect -- 挂载时按 flow 初始化状态并触发加载 */
  React.useEffect(() => {
    setFlowError('');
    setDrafts([]);
    setReviewItems([]);
    setInstallItems([]);
    setProgressItems([]);
    setInstallTarget('personal');
    if (flow.kind === 'draft') {
      openReview(flow.drafts);
      return;
    }
    if (!flow.requests?.length) {
      setPhase('selecting');
      return;
    }
    void prepareRequests(flow.requests);
    // flow 是每次打开新建的对象，用它做重置依据；两个回调本身是稳定的
  }, [flow, openReview, prepareRequests]);
  /* oxlint-enable react/set-state-in-effect */

  const canClose = canCloseFlow(phase, !!flowError);
  const readyItems = readyReviewItems(reviewItems);
  const summary = summarizeInstall(installItems);
  const failedItems = installItems.filter((item) => item.status === 'failed');
  const targetLabel = installTargetLabel(
    installTarget,
    shareConfig.read_scope.access_level,
  );

  const installDrafts = async () => {
    if (installTarget === 'shared') {
      const invalid = validateShareConfig(shareConfig);
      if (invalid) {
        setFlowError(invalid);
        return;
      }
    }
    setPhase('installing');
    setFlowError('');
    let next = toInstallItems(readyItems);
    setInstallItems(next);
    const remaining = [...drafts];
    const forgetRemaining = (draftId: string) => {
      const index = remaining.findIndex((draft) => draft.draft_id === draftId);
      if (index >= 0) remaining.splice(index, 1);
    };
    try {
      for (const draft of drafts) {
        const slugs = readyItems
          .filter((item) => item.draft_id === draft.draft_id)
          .map((item) => item.slug);
        if (!slugs.length) {
          await skillApi.discardDraft(draft.draft_id);
          forgetRemaining(draft.draft_id);
          removeDraft(draft.draft_id);
          continue;
        }
        const results =
          installTarget === 'personal'
            ? await skillApi.confirmPersonalDraft(draft.draft_id, slugs)
            : await skillApi.confirmSharedDraft(draft.draft_id, {
                share_config: shareConfig,
                slugs,
              });
        next = applyInstallResults(next, results, draft.source);
        setInstallItems(next);
        // 整份草稿一个都没装上时后端不会清理草稿，这里补一次
        if (!results.some((result) => result.success)) {
          await skillApi.discardDraft(draft.draft_id);
        }
        forgetRemaining(draft.draft_id);
        removeDraft(draft.draft_id);
      }
    } catch (error) {
      await discardDrafts(remaining);
      const message =
        error instanceof Error ? error.message : '安装 Skill 失败';
      setFlowError(message);
      next = failWaitingItems(next, message);
      setInstallItems(next);
    } finally {
      setPhase('result');
    }
  };

  const removeDraft = (draftId: string) => {
    setDrafts((current) =>
      current.filter((draft) => draft.draft_id !== draftId),
    );
  };

  const finishFlow = () => {
    onCompleted(summarizeInstall(installItems));
    onClose();
  };

  const handleClose = () => {
    if (!canClose) return;
    if (phase === 'result') {
      finishFlow();
      return;
    }
    if (phase === 'reviewing') void discardDrafts(drafts);
    onClose();
  };

  const retryFailed = () => {
    const requests = retryRequests(installItems);
    if (!requests.length) {
      setFlowError('该失败项需要从原入口重新上传');
      return;
    }
    void prepareRequests(requests);
  };

  const removeReviewItem = (item: ReviewItem) => {
    setReviewItems((current) =>
      current.filter((candidate) => candidate.key !== item.key),
    );
  };

  const modalTitle = flow.title || '安装 Skill';
  const modalDescription =
    flow.description || '加载 Skill，确认安装内容与生效范围。';

  const footerSummary = (() => {
    if (phase === 'selecting') return picker.summary;
    if (phase === 'preparing') {
      return flowError ? '已清理本次生成的临时草稿' : '正在完成短时加载请求';
    }
    if (phase === 'reviewing') {
      return `${readyItems.length} 个可安装 · ${targetLabel}`;
    }
    if (phase === 'installing') {
      return '已成功的 Skill 不会因其他项失败而回滚';
    }
    return `成功 ${summary.success} 个，失败 ${summary.failed} 个`;
  })();

  return (
    <Modal
      open
      onCancel={() => {
        if (canClose) handleClose();
      }}
      // 安装中与解析中不允许用 Esc/点遮罩关掉（草稿与进度会丢）
      keyboard={!canClose ? false : undefined}
      maskClosable={canClose}
      closable={false}
      width={768}
      data-testid="skill-install-flow"
      title={
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-medium bg-color-fill-2 text-color-text-2">
              <PackageOpen className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate">{modalTitle}</span>
          </div>
          <div className="text-xs font-normal text-color-text-3">
            {modalDescription}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-xs text-color-text-3"
              data-testid="install-step"
            >
              {phaseStepIndex(phase) + 1}/{STEP_LABELS.length} ·{' '}
              {STEP_LABELS[phaseStepIndex(phase)]}
            </span>
            <Button
              htmlType="button"
              type="text"
              size="small"
              aria-label="关闭"
              disabled={!canClose}
              onClick={handleClose}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      }
      footer={null}
    >
      <div className="flex min-h-0 flex-col gap-3">
        {phase === 'selecting' ? <RemoteSkillPicker picker={picker} /> : null}

        {phase === 'preparing' ? (
          <div className="flex flex-col gap-3" aria-live="polite">
            <div
              className={cn(
                'flex flex-col items-center gap-1 rounded-medium border border-color-border-1 px-4 py-6 text-center',
              )}
            >
              {flowError ? (
                <XCircle className="size-5 text-danger-6" aria-hidden />
              ) : (
                <LoaderCircle
                  className="size-5 animate-spin text-color-text-3"
                  aria-hidden
                />
              )}
              <strong className="text-sm text-color-text-1">
                {flowError
                  ? 'Skill 加载失败'
                  : `正在加载 ${progressItems.length} 个 Skill`}
              </strong>
              <span className="text-xs text-color-text-3">
                {flowError || '从远程仓库拉取并解析，通常只需片刻'}
              </span>
            </div>
            {progressItems.length ? (
              <InstallStatusList items={progressItems} />
            ) : null}
          </div>
        ) : null}

        {phase === 'reviewing' ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <strong className="text-sm text-color-text-1">
                确认安装内容
              </strong>
              <span className="text-xs text-color-text-3">
                {readyItems.length} 个 Skill，共用下方安装设置
              </span>
            </div>
            <ul
              className="flex max-h-56 flex-col gap-1 overflow-y-auto"
              data-testid="review-list"
            >
              {reviewItems.map((item) => (
                <li
                  key={item.key}
                  className={cn(
                    'flex items-start gap-2 rounded-small border border-color-border-1 px-3 py-2',
                    item.success ? undefined : 'border-danger-3 bg-danger-1',
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <strong className="truncate text-sm text-color-text-1">
                      {item.name}
                    </strong>
                    <span className="truncate text-xs text-color-text-3">
                      {item.description || item.error || '暂无描述'}
                    </span>
                    {installTarget === 'shared' && item.warnings.length ? (
                      <span role="alert" className="text-xs text-warning-6">
                        {item.warnings.join('；')}
                      </span>
                    ) : null}
                  </span>
                  {!item.success ? (
                    <span className="shrink-0 text-xs text-danger-6">
                      解析失败
                    </span>
                  ) : null}
                  <Button
                    htmlType="button"
                    variant="text"
                    size="small"
                    aria-label={`移除 ${item.name}`}
                    onClick={() => removeReviewItem(item)}
                  >
                    <X className="size-3.5" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm text-color-text-1">安装位置</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  htmlType="button"
                  variant={installTarget === 'personal' ? 'solid' : 'outlined'}
                  color={installTarget === 'personal' ? 'primary' : 'default'}
                  className="h-auto flex-col items-start gap-1 px-3 py-2 text-left whitespace-normal"
                  aria-pressed={installTarget === 'personal'}
                  onClick={() => setInstallTarget('personal')}
                >
                  <span className="text-sm">
                    个人 Skill <b>推荐</b>
                  </span>
                  <span className="text-xs font-normal opacity-80">
                    仅自己可用，保存在个人 Skill 持久源，不进入平台数据库。
                  </span>
                </Button>
                {isAdmin ? (
                  <Button
                    htmlType="button"
                    variant={installTarget === 'shared' ? 'solid' : 'outlined'}
                    color={installTarget === 'shared' ? 'primary' : 'default'}
                    className="h-auto flex-col items-start gap-1 px-3 py-2 text-left whitespace-normal"
                    aria-pressed={installTarget === 'shared'}
                    onClick={() => setInstallTarget('shared')}
                  >
                    <span className="text-sm">共享 Skill</span>
                    <span className="text-xs font-normal opacity-80">
                      进入平台 Skill 库，并继续配置指定人、部门或全局范围。
                    </span>
                  </Button>
                ) : null}
              </div>
              {installTarget === 'personal' ? (
                <p className="text-xs text-color-text-3">
                  {PERSONAL_INSTALL_NOTE}
                </p>
              ) : null}
            </section>

            {installTarget === 'shared' ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm text-color-text-1">生效范围</h3>
                <ShareConfigForm
                  value={shareConfig}
                  onChange={(next) => {
                    setFlowError('');
                    setShareConfig(next);
                  }}
                  allowedLevels={allowedLevels}
                  departments={(targets.data?.departments ?? []).map(
                    (item) => ({ value: item.id, label: item.name }),
                  )}
                  users={(targets.data?.users ?? []).map((item) => ({
                    value: item.uid,
                    label: item.department_name
                      ? `${item.username}（${item.department_name}）`
                      : item.username,
                  }))}
                  targetsLoading={targets.isPending}
                  autoSelectUser={{
                    uid: user.data?.uid,
                    departmentId: user.data?.department_id ?? null,
                  }}
                  error={flowError || null}
                />
              </section>
            ) : null}

            {installTarget === 'personal' && flowError ? (
              <p role="alert" className="text-sm text-danger-6">
                {flowError}
              </p>
            ) : null}
          </div>
        ) : null}

        {phase === 'installing' ? (
          <div
            className="flex flex-col items-center gap-1 rounded-medium border border-color-border-1 px-4 py-6 text-center"
            aria-live="polite"
          >
            <LoaderCircle
              className="size-5 animate-spin text-color-text-3"
              aria-hidden
            />
            <strong className="text-sm text-color-text-1">
              正在安装 {installItems.length} 个 Skill
            </strong>
            <span className="text-xs text-color-text-3">
              正在安装到：{targetLabel}
            </span>
          </div>
        ) : null}

        {phase === 'result' ? (
          <div className="flex flex-col gap-3" aria-live="polite">
            <div className="flex items-baseline justify-between gap-2">
              <strong className="text-sm text-color-text-1">
                {resultTitle(installItems)}
              </strong>
              <span className="text-xs text-color-text-3">
                成功 {summary.success} 个，失败 {summary.failed} 个
              </span>
            </div>
            <InstallStatusList items={installItems} />
            {flowError ? (
              <p role="alert" className="text-sm text-danger-6">
                {flowError}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        <span
          className="min-w-0 truncate text-xs text-color-text-3"
          data-testid="install-footer-summary"
        >
          {footerSummary}
        </span>
        <div className="flex items-center gap-2">
          {phase === 'selecting' ? (
            <>
              <Button
                htmlType="button"
                variant="outlined"
                onClick={handleClose}
              >
                取消
              </Button>
              <Button
                htmlType="button"
                disabled={!picker.canSubmit}
                onClick={() => void prepareRequests(picker.buildRequests())}
              >
                解析并确认
              </Button>
            </>
          ) : null}

          {phase === 'preparing' ? (
            flowError ? (
              <Button
                htmlType="button"
                variant="outlined"
                onClick={handleClose}
              >
                关闭
              </Button>
            ) : (
              <Button htmlType="button" disabled>
                <Spin aria-hidden className="size-3.5" />
                正在加载
              </Button>
            )
          ) : null}

          {phase === 'reviewing' ? (
            <>
              <Button
                htmlType="button"
                variant="outlined"
                onClick={handleClose}
              >
                取消
              </Button>
              <Button
                htmlType="button"
                disabled={readyItems.length === 0}
                onClick={() => void installDrafts()}
              >
                确认安装 {readyItems.length} 个 Skill · {targetLabel}
              </Button>
            </>
          ) : null}

          {phase === 'installing' ? (
            <Button htmlType="button" disabled>
              <Spin aria-hidden className="size-3.5" />
              正在安装
            </Button>
          ) : null}

          {phase === 'result' ? (
            <>
              {failedItems.length ? (
                <Button
                  htmlType="button"
                  variant="outlined"
                  onClick={retryFailed}
                >
                  重新加载失败项
                </Button>
              ) : null}
              <Button htmlType="button" onClick={finishFlow}>
                完成
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </Modal>
  );
};
