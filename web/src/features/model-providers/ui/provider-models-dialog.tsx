/**
 * 供应商的模型管理对话框。
 *
 * 上半是已启用模型（类型、上下文、维度、测试连接、配置、移除），下半是远端候选
 * （搜索、类型筛选、价格与模态标签、逐个启用）。价格只在远端响应带 `pricing` 时显示，
 * 缺价显示 N/A；移除模型走命令式确认框。
 */
import * as React from 'react';
import { Button, Input, Modal, Spin, Tag } from 'antd';
import {
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Music,
  Plus,
  Search,
  Settings2,
  Trash2,
  Video,
  Zap,
} from 'lucide-react';

import type {
  EnabledModel,
  ModelProvider,
  ModelStatus,
  ModelType,
  RemoteModel,
} from '../api/model-provider-api';
import {
  filterRemoteModels,
  formatPriceDisplay,
  formatTokenCount,
  isModelStale,
  modelDisplayName,
  modelStatusText,
  normalizeRemotePrice,
  remoteToEnabledModel,
  remoteTypeCounts,
} from '../lib/provider-view';
import {
  useFetchRemoteModels,
  useTestModelStatus,
} from '../model/provider-queries';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Empty } from 'antd';
import { useNotifications } from '@/shared/ui/notifications';

type ProviderModelsDialogProps = {
  onOpenChange: (open: boolean) => void;
  provider: ModelProvider;
  /** 更新请求在飞行中。 */
  saving: boolean;
  /** 提交新的已启用模型清单。 */
  onUpdateModels: (models: EnabledModel[]) => void;
  /** 移除单个模型；面板先做默认模型保护再提交。 */
  onRemoveModel: (model: EnabledModel) => void;
  /** 打开模型配置对话框；传 null 表示手动添加。 */
  onOpenModelForm: (model: EnabledModel | null) => void;
};

const MODALITY_ICONS: Record<string, { icon: typeof FileText; label: string }> =
  {
    text: { icon: FileText, label: '文本输入' },
    image: { icon: ImageIcon, label: '图像输入' },
    video: { icon: Video, label: '视频输入' },
    audio: { icon: Music, label: '音频输入' },
    pdf: { icon: FileText, label: 'PDF 文档输入' },
  };

export const ProviderModelsDialog = ({
  onOpenChange,
  provider,
  saving,
  onUpdateModels,
  onRemoveModel,
  onOpenModelForm,
}: ProviderModelsDialogProps) => {
  const { confirm } = useConfirm();
  const notifications = useNotifications();
  const fetchRemote = useFetchRemoteModels();
  const testStatus = useTestModelStatus();
  const [remoteModels, setRemoteModels] = React.useState<RemoteModel[]>([]);
  const [remoteLoaded, setRemoteLoaded] = React.useState(false);
  const [keyword, setKeyword] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState<ModelType | 'all'>('all');
  const [currency, setCurrency] = React.useState<'USD' | 'CNY'>('USD');
  const [statusBySpec, setStatusBySpec] = React.useState<
    Record<string, ModelStatus>
  >({});

  const providerId = provider.provider_id;

  const notifyError = (message: string) =>
    notifications.addNotification({
      type: 'error',
      title: '模型供应商',
      message,
    });

  const onFetchRemote = async () => {
    try {
      const models = await fetchRemote.mutateAsync(provider.provider_id);
      setRemoteModels(models);
      setRemoteLoaded(true);
      notifications.addNotification({
        type: 'success',
        title: '模型供应商',
        message: `已获取 ${models.length} 个远端模型。`,
      });
    } catch (error) {
      notifyError(
        error instanceof Error ? error.message : '获取远端模型失败。',
      );
    }
  };

  const onTestModel = async (model: EnabledModel) => {
    const spec = `${provider.provider_id}:${model.id}`;
    try {
      const result = await testStatus.mutateAsync(spec);
      setStatusBySpec((current) => ({ ...current, [spec]: result }));
      notifications.addNotification({
        type:
          result.status === 'available'
            ? 'success'
            : result.status === 'unavailable'
              ? 'warning'
              : 'error',
        title: modelDisplayName(model),
        message: modelStatusText(result),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '模型连接测试失败。';
      setStatusBySpec((current) => ({
        ...current,
        [spec]: { spec, status: 'error', message },
      }));
      notifyError(message);
    }
  };

  const onAddRemote = (model: RemoteModel) => {
    onUpdateModels([...provider.enabled_models, remoteToEnabledModel(model)]);
  };

  const onRemove = async (model: EnabledModel) => {
    const confirmed = await confirm({
      title: `移除模型「${modelDisplayName(model)}」？`,
      description: '移除后该模型不再出现在模型选择与调用范围里。',
      confirmText: '移除',
      destructive: true,
    });
    if (!confirmed) return;
    onRemoveModel(model);
  };

  const enabledIds = new Set(provider.enabled_models.map((model) => model.id));
  const visibleRemote = filterRemoteModels(remoteModels, keyword, typeFilter);
  const counts = remoteTypeCounts(remoteModels);
  const remoteIdsByProvider: Record<string, string[]> = {
    [providerId]: remoteModels.map((model) => model.id),
  };
  const remoteLoadedByProvider: Record<string, boolean> = {
    [providerId]: remoteLoaded,
  };

  const typeFilters: { value: ModelType | 'all'; label: string }[] = [
    { value: 'all', label: `全部 ${counts.all}` },
    { value: 'chat', label: `对话 ${counts.chat}` },
    { value: 'embedding', label: `向量 ${counts.embedding}` },
    { value: 'rerank', label: `重排 ${counts.rerank}` },
  ];

  return (
    <Modal
      open
      onCancel={() => onOpenChange(false)}
      width={768}
      data-testid="provider-models-dialog"
      title={
        <div>
          <div>
            {provider ? `${provider.display_name} - 模型配置` : '模型配置'}
          </div>
          <div className="text-xs font-normal text-color-text-3">
            已启用模型来自供应商配置；远端候选只做展示，启用后才写入配置。
          </div>
        </div>
      }
      footer={null}
    >
      {provider ? (
        <div className="flex max-h-[65vh] flex-col gap-5 overflow-y-auto pr-1">
          <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-medium">
                已启用模型（{provider.enabled_models.length}）
              </h4>
              <div className="flex gap-2">
                <Button
                  htmlType="button"
                  size="small"
                  loading={fetchRemote.isPending}
                  onClick={() => void onFetchRemote()}
                >
                  获取远程模型
                </Button>
                <Button
                  htmlType="button"
                  size="small"
                  variant="outlined"
                  icon={<Plus className="size-3.5" aria-hidden />}
                  onClick={() => onOpenModelForm(null)}
                >
                  手动添加
                </Button>
              </div>
            </div>

            {provider.enabled_models.length === 0 ? (
              <Empty description="暂无已启用模型。" />
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-color-text-3">
                  <tr>
                    <th scope="col" className="py-1 font-normal">
                      模型
                    </th>
                    <th scope="col" className="py-1 font-normal">
                      类型
                    </th>
                    <th scope="col" className="py-1 font-normal">
                      上下文
                    </th>
                    <th scope="col" className="py-1 font-normal">
                      维度
                    </th>
                    <th scope="col" className="py-1 text-right font-normal">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {provider.enabled_models.map((model) => {
                    const spec = `${provider.provider_id}:${model.id}`;
                    const stale = isModelStale(
                      model,
                      provider.provider_id,
                      remoteIdsByProvider,
                      remoteLoadedByProvider,
                    );
                    const testing =
                      testStatus.isPending && testStatus.variables === spec;
                    return (
                      <tr key={model.id} className="border-t border-border">
                        <td className="py-1.5 pr-2">
                          <span className="block">
                            {modelDisplayName(model)}
                          </span>
                          <span className="block text-xs break-all text-color-text-3">
                            {model.id}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2">
                          <span className="flex items-center gap-1">
                            <Tag>{model.type}</Tag>
                            {model.source === 'manual' ? (
                              <Tag title="管理员手动添加">手动</Tag>
                            ) : null}
                            {stale ? (
                              <Tag color="error" title="远端清单里已不存在">
                                已下线
                              </Tag>
                            ) : null}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2 text-xs text-color-text-2">
                          {formatTokenCount(model.context_length) || '-'}
                        </td>
                        <td className="py-1.5 pr-2 text-xs text-color-text-2">
                          {model.type === 'embedding' && !model.dimension ? (
                            <span
                              title="缺少维度配置"
                              className="text-warning-6"
                            >
                              ⚠
                            </span>
                          ) : (
                            (model.dimension ?? '-')
                          )}
                        </td>
                        <td className="py-1.5">
                          <span className="flex justify-end gap-1">
                            <Button
                              htmlType="button"
                              size="small"
                              variant="text"
                              aria-label="测试模型连接"
                              title={modelStatusText(statusBySpec[spec])}
                              onClick={() => void onTestModel(model)}
                            >
                              {testing ? (
                                <LoaderCircle
                                  className="size-3.5 animate-spin"
                                  aria-hidden
                                />
                              ) : (
                                <Zap className="size-3.5" aria-hidden />
                              )}
                            </Button>
                            <Button
                              htmlType="button"
                              size="small"
                              variant="text"
                              aria-label={`配置 ${modelDisplayName(model)}`}
                              title={`配置 ${modelDisplayName(model)}`}
                              onClick={() => onOpenModelForm(model)}
                            >
                              <Settings2 className="size-3.5" aria-hidden />
                            </Button>
                            <Button
                              htmlType="button"
                              size="small"
                              variant="text"
                              aria-label={`移除 ${modelDisplayName(model)}`}
                              title={`移除 ${modelDisplayName(model)}`}
                              disabled={saving}
                              onClick={() => void onRemove(model)}
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </Button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-medium">
                远端候选模型（{visibleRemote.length}）
              </h4>
              {remoteModels.length > 0 ? (
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-color-text-3"
                      aria-hidden
                    />
                    <Input
                      value={keyword}
                      aria-label="搜索远端模型"
                      placeholder="搜索模型…"
                      className="h-7 w-44 pl-7 text-xs"
                      onChange={(event) => setKeyword(event.target.value)}
                    />
                  </div>
                  <Button
                    htmlType="button"
                    size="small"
                    variant="outlined"
                    aria-label={
                      currency === 'CNY' ? '切换为美元计费' : '切换为人民币计费'
                    }
                    onClick={() =>
                      setCurrency(currency === 'CNY' ? 'USD' : 'CNY')
                    }
                  >
                    {currency === 'CNY' ? '¥' : '$'}
                  </Button>
                  <div className="flex gap-1">
                    {typeFilters.map((item) => (
                      <Button
                        key={item.value}
                        htmlType="button"
                        size="small"
                        variant={
                          typeFilter === item.value ? 'solid' : 'outlined'
                        }
                        color={
                          typeFilter === item.value ? 'primary' : 'default'
                        }
                        onClick={() => setTypeFilter(item.value)}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {remoteModels.length === 0 ? (
              <p className="py-4 text-sm text-color-text-3">
                {fetchRemote.isPending ? (
                  <span className="flex items-center gap-2">
                    <Spin aria-hidden className="size-4" />
                    正在获取远端模型…
                  </span>
                ) : (
                  '点「获取远程模型」从供应商拉取候选清单；不拉取也可以手动添加。'
                )}
              </p>
            ) : (
              <ul className="flex flex-col">
                {visibleRemote.map((model) => {
                  const price = formatPriceDisplay(
                    normalizeRemotePrice(model.pricing),
                    currency,
                  );
                  const added = enabledIds.has(model.id);
                  return (
                    <li
                      key={`${model.id}-${model.type}`}
                      className="flex items-center gap-2 border-t border-border py-1.5 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {modelDisplayName(model)}
                      </span>
                      <span className="flex items-center gap-1">
                        {(model.input_modalities ?? []).map((modality) => {
                          const display = MODALITY_ICONS[modality];
                          if (!display) return null;
                          const Icon = display.icon;
                          return (
                            <span
                              key={modality}
                              title={display.label}
                              className="text-color-text-3 [&_svg]:size-3.5"
                            >
                              <Icon aria-hidden />
                              <span className="sr-only">{display.label}</span>
                            </span>
                          );
                        })}
                        <Tag>{model.type || 'chat'}</Tag>
                      </span>
                      <span className="w-16 text-right text-xs text-color-text-2">
                        {formatTokenCount(model.context_length) || '-'}
                      </span>
                      <span className="w-32 text-right text-xs text-color-text-2">
                        {price || (
                          <span className="text-color-text-4">N/A</span>
                        )}
                      </span>
                      <Button
                        htmlType="button"
                        size="small"
                        className="[&_svg]:size-3.5 [&_svg]:m-0"
                        variant={added ? 'solid' : 'outlined'}
                        color={added ? 'primary' : 'default'}
                        disabled={added}
                        aria-label={
                          added
                            ? `${modelDisplayName(model)} 已启用`
                            : `启用 ${modelDisplayName(model)}`
                        }
                        title={
                          added
                            ? `${modelDisplayName(model)} 已启用`
                            : `启用 ${modelDisplayName(model)}`
                        }
                        onClick={() => onAddRemote(model)}
                      >
                        {added ? (
                          <CheckCircle2 className="size-3.5" aria-hidden />
                        ) : (
                          <Plus className="size-3.5" aria-hidden />
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      <div className="flex justify-end gap-2 pt-2">
        <Button
          htmlType="button"
          variant="outlined"
          onClick={() => onOpenChange(false)}
        >
          关闭
        </Button>
      </div>
    </Modal>
  );
};
