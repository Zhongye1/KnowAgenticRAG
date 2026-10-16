/**
 * 模型供应商管理面板。
 *
 * 搜索 + 启用/未启用两组卡片 + 三个对话框（供应商表单、模型管理、模型配置）。
 * 默认模型保护在这里收口：删除供应商、停用供应商、移除模型三条路径都先比对系统配置的
 * `default_model`；该配置读不到时保护不可验证，删除与停用改为二次确认而不是放行。
 */
import * as React from 'react';
import { Plus, RefreshCw, Search } from 'lucide-react';

import type { EnabledModel, ModelProvider } from '../api/model-provider-api';
import {
  buildModelPayload,
  buildProviderPayload,
  capabilityConflicts,
  filterProviders,
  isDefaultModel,
  providerHasDefaultModel,
  providerStats,
  splitProviders,
  type ModelForm,
  type ProviderForm,
} from '../lib/provider-view';
import {
  useCreateProvider,
  useDefaultModelSpec,
  useDeleteProvider,
  useModelProviders,
  useUpdateProvider,
} from '../model/provider-queries';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { useNotifications } from '@/shared/ui/notifications';

import { Button, Empty, Input, Spin } from 'antd';
import { ModelFormDialog } from './model-form-dialog';
import { ProviderCard } from './provider-card';
import { ProviderFormDialog } from './provider-form-dialog';
import { ProviderModelsDialog } from './provider-models-dialog';

export const ModelProviderPanel = () => {
  const { confirm } = useConfirm();
  const notifications = useNotifications();
  const providers = useModelProviders();
  const defaultModel = useDefaultModelSpec();
  const createMutation = useCreateProvider();
  const updateMutation = useUpdateProvider();
  const deleteMutation = useDeleteProvider();

  const [keyword, setKeyword] = React.useState('');
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingProvider, setEditingProvider] =
    React.useState<ModelProvider | null>(null);
  const [modelsProviderId, setModelsProviderId] = React.useState<string | null>(
    null,
  );
  const [modelFormOpen, setModelFormOpen] = React.useState(false);
  const [editingModel, setEditingModel] = React.useState<EnabledModel | null>(
    null,
  );

  const defaultSpec = defaultModel.data ?? '';
  const list = React.useMemo(() => providers.data ?? [], [providers.data]);
  const filtered = React.useMemo(
    () => filterProviders(list, keyword),
    [list, keyword],
  );
  const groups = React.useMemo(() => splitProviders(filtered), [filtered]);
  const stats = React.useMemo(() => providerStats(list), [list]);
  // 模型管理对话框按 id 取最新数据：更新模型清单后弹窗里要立刻反映
  const modelsProvider =
    list.find((item) => item.provider_id === modelsProviderId) ?? null;
  const saving =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  const notifyError = (message: string) =>
    notifications.addNotification({
      type: 'error',
      title: '模型供应商',
      message,
    });
  const notifyWarning = (message: string) =>
    notifications.addNotification({
      type: 'warning',
      title: '模型供应商',
      message,
    });
  const notifySuccess = (message: string) =>
    notifications.addNotification({
      type: 'success',
      title: '模型供应商',
      message,
    });

  /**
   * 默认模型读不到时保护失效（后端没有这条守卫），此时删除与停用要求二次确认，
   * 避免「配置接口故障」被当成「没有被默认模型使用」。
   */
  const confirmWithoutDefaultModel = async (action: '停用' | '删除') => {
    if (!defaultModel.isError) return true;
    return confirm({
      title: '默认模型读取失败，无法确认该供应商是否正在被使用',
      description: `系统配置接口暂时不可用，继续${action}可能让当前默认模型失效。`,
      confirmText: `仍然${action}`,
      destructive: true,
    });
  };

  const openCreate = () => {
    setEditingProvider(null);
    setFormOpen(true);
  };

  const openEdit = (provider: ModelProvider) => {
    setEditingProvider(provider);
    setFormOpen(true);
  };

  const submitProvider = async (
    form: ProviderForm,
    options: { enable: boolean },
  ) => {
    if (
      editingProvider &&
      !options.enable &&
      !form.is_enabled &&
      providerHasDefaultModel(defaultSpec, editingProvider.provider_id)
    ) {
      notifyWarning('当前默认模型正在使用该供应商，请先切换默认模型。');
      return;
    }
    if (editingProvider && !options.enable && !form.is_enabled) {
      if (!(await confirmWithoutDefaultModel('停用'))) return;
    }
    const conflicts = capabilityConflicts(
      form.capabilities,
      editingProvider?.enabled_models ?? [],
    );
    if (conflicts.length > 0) {
      notifyError(
        `仍有已启用模型属于 ${conflicts.join('、')}，请先移除这些模型再取消对应能力。`,
      );
      return;
    }
    try {
      const payload = buildProviderPayload(form);
      if (editingProvider) {
        await updateMutation.mutateAsync({
          providerId: editingProvider.provider_id,
          payload: options.enable ? { ...payload, is_enabled: true } : payload,
        });
        notifySuccess(
          options.enable ? '供应商已保存并启用。' : '供应商已保存。',
        );
      } else {
        await createMutation.mutateAsync({
          ...payload,
          provider_id: form.provider_id,
        });
        notifySuccess('供应商已创建。');
      }
      setFormOpen(false);
      setEditingProvider(null);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '保存供应商失败。');
    }
  };

  const removeProvider = async (provider: ModelProvider) => {
    if (providerHasDefaultModel(defaultSpec, provider.provider_id)) {
      notifyWarning('当前默认模型正在使用该供应商，请先切换默认模型。');
      return;
    }
    if (!(await confirmWithoutDefaultModel('删除'))) return;
    const confirmed = await confirm({
      title: `删除 ${provider.display_name}？`,
      description: '删除后不会影响当前系统正在使用的旧模型配置。',
      confirmText: '删除',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(provider.provider_id);
      notifySuccess('供应商已删除。');
      setFormOpen(false);
      setEditingProvider(null);
      if (modelsProviderId === provider.provider_id) setModelsProviderId(null);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '删除供应商失败。');
    }
  };

  const updateModels = async (models: EnabledModel[]) => {
    if (!modelsProvider) return;
    try {
      await updateMutation.mutateAsync({
        providerId: modelsProvider.provider_id,
        payload: { enabled_models: models },
      });
    } catch (error) {
      notifyError(
        error instanceof Error ? error.message : '保存模型清单失败。',
      );
    }
  };

  const saveModel = async (form: ModelForm, isCreate: boolean) => {
    if (!modelsProvider) return;
    const existing = modelsProvider.enabled_models;
    const original = existing.find((item) => item.id === form.id.trim());
    // 编辑走「原对象 + 表单字段」：整对象替换会丢掉 context_length 等表单不编辑的字段
    const model = buildModelPayload(form, isCreate ? undefined : original);
    if (!model.id) {
      notifyError('请填写模型 ID。');
      return;
    }
    if (isCreate && existing.some((item) => item.id === model.id)) {
      notifyError('模型 ID 已存在。');
      return;
    }
    const next = isCreate
      ? [...existing, { ...model, source: 'manual' as const }]
      : existing.map((item) => (item.id === model.id ? model : item));
    try {
      await updateMutation.mutateAsync({
        providerId: modelsProvider.provider_id,
        payload: { enabled_models: next },
      });
      notifySuccess(isCreate ? '模型已添加。' : '模型配置已保存。');
      setModelFormOpen(false);
      setEditingModel(null);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '保存模型失败。');
    }
  };

  const removeModelById = async (model: EnabledModel) => {
    if (!modelsProvider) return;
    if (isDefaultModel(defaultSpec, modelsProvider.provider_id, model.id)) {
      notifyWarning('当前默认模型正在使用该模型，请先切换默认模型。');
      return;
    }
    await updateModels(
      modelsProvider.enabled_models.filter((item) => item.id !== model.id),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 与智能体面板同规格：ant reset 在 base 层压过组件层的 color/font，
          主按钮白字、输入框 32px 高与按钮对齐、上限 33vw，新增按钮 ml-auto
          连同刷新一起靠右 */}
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
            placeholder="搜索供应商…"
            aria-label="搜索供应商"
            className="h-8 pl-8 leading-8"
          />
        </div>
        {/* m-0：p 的默认下边距会把 flex 居中算歪（视觉偏上 6px） */}
        <p
          className="m-0 text-xs text-color-text-3"
          data-testid="provider-stats"
        >
          共 {stats.total} 个 · 已启用 {stats.enabled} 个 · 已启用模型{' '}
          {stats.models} 个
          {stats.warning > 0 ? ` · 凭证缺失 ${stats.warning} 个` : ''}
        </p>
        {defaultModel.isError ? (
          <output className="text-xs text-warning-6">
            默认模型读取失败，删除与停用保护暂不可用。
          </output>
        ) : null}
        <Button
          htmlType="button"
          type="primary"
          icon={<Plus className="size-4" aria-hidden />}
          /* shadow-none：antd 非线框主按钮自带的 2px 底部投影不要 */
          className="ml-auto text-color-white shadow-none"
          onClick={openCreate}
        >
          新增供应商
        </Button>
        <Button
          htmlType="button"
          type="text"
          size="small"
          aria-label="刷新供应商列表"
          onClick={() => void providers.refetch()}
        >
          <RefreshCw
            className={`size-4 ${providers.isFetching ? 'animate-spin' : ''}`}
            aria-hidden
          />
        </Button>
      </div>

      {providers.isPending ? (
        <div className="flex items-center gap-2 py-8 text-sm text-color-text-3">
          <Spin aria-hidden className="size-4" />
          正在加载供应商…
        </div>
      ) : null}

      {providers.isError ? (
        <div className="flex flex-col items-start gap-2 py-6">
          <p role="alert" className="text-sm text-danger-6">
            {providers.error instanceof Error
              ? providers.error.message
              : '加载供应商失败。'}
          </p>
          <Button
            htmlType="button"
            variant="outlined"
            onClick={() => void providers.refetch()}
          >
            重试
          </Button>
        </div>
      ) : null}

      {!providers.isPending && !providers.isError && filtered.length === 0 ? (
        <Empty
          description={
            keyword ? '无匹配供应商。' : '暂无供应商，点击上方按钮新增。'
          }
        />
      ) : null}

      {groups.enabled.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm text-color-text-2">
            已启用（{groups.enabled.length}）
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {groups.enabled.map((provider) => (
              <ProviderCard
                key={provider.provider_id}
                provider={provider}
                onEdit={openEdit}
                onManageModels={(item) => setModelsProviderId(item.provider_id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {groups.disabled.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm text-color-text-2">
            未启用（{groups.disabled.length}）
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {groups.disabled.map((provider) => (
              <ProviderCard
                key={provider.provider_id}
                provider={provider}
                onEdit={openEdit}
                onManageModels={(item) => setModelsProviderId(item.provider_id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {formOpen ? (
        <ProviderFormDialog
          onOpenChange={(open) => {
            setFormOpen(open);
            if (!open) setEditingProvider(null);
          }}
          provider={editingProvider}
          saving={saving}
          onSubmit={(form, options) => void submitProvider(form, options)}
          onDelete={(provider) => void removeProvider(provider)}
        />
      ) : null}

      {modelsProvider ? (
        <ProviderModelsDialog
          onOpenChange={(open) => {
            if (!open) setModelsProviderId(null);
          }}
          provider={modelsProvider}
          saving={saving}
          onUpdateModels={(models) => void updateModels(models)}
          onRemoveModel={(model) => void removeModelById(model)}
          onOpenModelForm={(model) => {
            setEditingModel(model);
            setModelFormOpen(true);
          }}
        />
      ) : null}

      {modelFormOpen && modelsProvider ? (
        <ModelFormDialog
          onOpenChange={(open) => {
            setModelFormOpen(open);
            if (!open) setEditingModel(null);
          }}
          provider={modelsProvider}
          model={editingModel}
          saving={saving}
          onSave={(form, isCreate) => void saveModel(form, isCreate)}
        />
      ) : null}
    </div>
  );
};
