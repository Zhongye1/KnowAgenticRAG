/** API Key 管理面板。 */
import * as React from 'react';
import { Copy, Key, Plus, RefreshCw, Trash2 } from 'lucide-react';

import {
  Alert,
  Button,
  DatePicker,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Spin,
  Switch,
  Tooltip,
} from 'antd';

import {
  useApiKeys,
  useCreateApiKey,
  useDeleteApiKey,
  useUpdateApiKey,
  type ApiKeyItem,
} from '@/entities/user-apikey';
import { copyTextToClipboard, formatMinuteStamp } from '@/shared/lib';

import styles from './api-keys-panel.module.css';

/** 创建幂等键的 sessionStorage 位置。 */
const CREATE_REQUEST_STORAGE_KEY = 'ars_pending_api_key_request_id';

type ApiKeysPanelProps = {
  notifySuccess: (message: string) => void;
  notifyError: (message: string) => void;
};

export const ApiKeysPanel = ({
  notifySuccess,
  notifyError,
}: ApiKeysPanelProps) => {
  const { keys, isLoading, refetch } = useApiKeys();
  const createMutation = useCreateApiKey();
  const updateMutation = useUpdateApiKey();
  const deleteMutation = useDeleteApiKey();

  const [refreshing, setRefreshing] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createName, setCreateName] = React.useState('');
  /** DatePicker 的值对象（antd 内部 dayjs 实例）；只用到 format。 */
  type ExpiresValue = { format: (template: string) => string } | null;
  const [createExpires, setCreateExpires] = React.useState<ExpiresValue>(null);
  const [createdSecret, setCreatedSecret] = React.useState('');

  const showCreateModal = () => {
    setCreateName('');
    setCreateExpires(null);
    // 幂等键：弹窗打开时取（沿用上次未消费的），创建/取消后清掉
    const existing = sessionStorage.getItem(CREATE_REQUEST_STORAGE_KEY);
    if (!existing) {
      sessionStorage.setItem(
        CREATE_REQUEST_STORAGE_KEY,
        globalThis.crypto.randomUUID(),
      );
    }
    setCreateOpen(true);
  };

  const clearRequestId = () => {
    sessionStorage.removeItem(CREATE_REQUEST_STORAGE_KEY);
  };

  const handleCreate = async () => {
    const name = createName.trim();
    if (!name) {
      notifyError('请输入名称');
      return;
    }
    const requestId = sessionStorage.getItem(CREATE_REQUEST_STORAGE_KEY) ?? '';
    if (!requestId) {
      notifyError('创建失败：请重新打开弹窗');
      return;
    }

    try {
      const created = await createMutation.mutateAsync({
        requestId,
        name,
        ...(createExpires
          ? { expiresAt: createExpires.format('YYYY-MM-DDTHH:mm:ss') }
          : {}),
      });
      clearRequestId();
      setCreatedSecret(created.secret);
      setCreateOpen(false);
    } catch (error) {
      notifyError(
        error instanceof Error && error.message ? error.message : '创建失败',
      );
    }
  };

  const handleCreateCancel = () => {
    clearRequestId();
    setCreateOpen(false);
  };

  const copySecret = async () => {
    const ok = await copyTextToClipboard(createdSecret);
    if (ok) {
      notifySuccess('已复制到剪贴板');
    } else {
      notifyError('复制失败');
    }
  };

  const toggleEnabled = async (item: ApiKeyItem) => {
    try {
      await updateMutation.mutateAsync({
        id: item.id,
        input: { is_enabled: !item.isEnabled },
      });
      notifySuccess(item.isEnabled ? '已禁用' : '已启用');
    } catch (error) {
      notifyError(
        error instanceof Error && error.message ? error.message : '操作失败',
      );
    }
  };

  const handleDelete = async (item: ApiKeyItem) => {
    try {
      await deleteMutation.mutateAsync(item.id);
      notifySuccess('删除成功');
    } catch (error) {
      notifyError(
        error instanceof Error && error.message ? error.message : '删除失败',
      );
    }
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      refetch();
      notifySuccess('刷新成功');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>API Key 管理</div>
          <p className={styles.description}>
            用于外部系统调用 Agent 对话接口。密钥仅显示一次，请妥善保管。
          </p>
        </div>
        <div className={styles.actions}>
          <Button
            icon={
              <RefreshCw
                size={14}
                aria-hidden
                className={refreshing ? styles.spinning : ''}
              />
            }
            title="刷新"
            loading={refreshing}
            onClick={() => void handleRefresh()}
          />
          <Button
            type="primary"
            icon={<Plus size={14} aria-hidden />}
            onClick={showCreateModal}
          >
            创建 API Key
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className={styles.center}>
          <Spin />
        </div>
      ) : keys.length ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>名称</th>
              <th>前缀</th>
              <th>状态</th>
              <th>最后使用</th>
              <th>过期时间</th>
              <th className={styles.actionCol}>操作</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((item) => (
              <tr key={item.id}>
                <td>
                  <span className={styles.nameCell}>
                    <Key size={15} aria-hidden />
                    <span title={item.name}>{item.name}</span>
                  </span>
                </td>
                <td>
                  <code className={styles.codeBadge}>{item.keyPrefix}****</code>
                </td>
                <td>
                  <span className={styles.statusCell}>
                    <Switch
                      size="small"
                      aria-label={`启停 ${item.name}`}
                      checked={item.isEnabled}
                      loading={updateMutation.isPending}
                      onChange={() => void toggleEnabled(item)}
                    />
                    <span
                      className={
                        item.isEnabled ? styles.enabled : styles.disabled
                      }
                    >
                      {item.isEnabled ? '已启用' : '已禁用'}
                    </span>
                  </span>
                </td>
                <td className={styles.timeText}>
                  {formatMinuteStamp(item.lastUsedAt)}
                </td>
                <td className={styles.timeText}>
                  {item.expiresAt ?? '永不过期'}
                </td>
                <td className={styles.actionCol}>
                  <Popconfirm
                    title="确定要删除此 API Key 吗？此操作不可恢复。"
                    okText="确定"
                    cancelText="取消"
                    onConfirm={() => void handleDelete(item)}
                  >
                    <Tooltip title="删除 API Key">
                      <Button
                        type="text"
                        size="small"
                        danger
                        aria-label={`删除 ${item.name}`}
                      >
                        <Trash2 size={14} aria-hidden />
                      </Button>
                    </Tooltip>
                  </Popconfirm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Empty description="暂无 API Key，点击上方按钮创建一个" />
      )}

      <Modal
        open={createOpen}
        title="创建 API Key"
        okText="创建"
        cancelText="取消"
        confirmLoading={createMutation.isPending}
        onOk={() => void handleCreate()}
        onCancel={handleCreateCancel}
      >
        <div className={styles.form}>
          <label className={styles.formLabel} htmlFor="apikey-name">
            名称
          </label>
          <Input
            id="apikey-name"
            value={createName}
            placeholder="如：生产环境API"
            onChange={(event) => setCreateName(event.target.value)}
          />
          <label className={styles.formLabel} htmlFor="apikey-expires">
            过期时间
          </label>
          <DatePicker
            id="apikey-expires"
            showTime
            style={{ width: '100%' }}
            placeholder="留空表示永不过期"
            value={createExpires ?? null}
            onChange={setCreateExpires}
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(createdSecret)}
        title="API Key 已创建"
        footer={null}
        width={520}
        onCancel={() => setCreatedSecret('')}
      >
        <div className={styles.secretDisplay}>
          <Alert
            type="warning"
            showIcon
            message="请立即复制密钥，关闭后将无法再次查看完整密钥"
          />
          <div className={styles.secretRow}>
            <code className={styles.secretValue}>{createdSecret}</code>
            <Button
              type="primary"
              icon={<Copy size={14} aria-hidden />}
              onClick={() => void copySecret()}
            >
              复制
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
