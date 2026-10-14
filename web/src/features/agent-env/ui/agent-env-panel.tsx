/**
 * 沙盒环境变量编辑面板。
 *
 * 对齐参照 `AgentEnvSettingsCard.vue` + `McpEnvEditor.vue` 的这一屏：KV 行编辑（键 + 值 +
 * 删除）、新增行、脏状态驱动保存钮文案，顶部提示「保存后只对新建沙盒生效」。校验与后端
 * `validate_agent_env` 同常量（键名模式、键值长度、最多 200 条），已保存的键锁定键名
 * （防误改导致旧变量残留），值可改；值默认掩码显示，点眼睛切换。
 */
import * as React from 'react';
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';

import { Alert, Button, Input, Spin, Tooltip } from 'antd';

import { useAgentEnv, useUpdateAgentEnv } from '@/entities/agent-env';

import styles from './agent-env-panel.module.css';

/** 键名模式；与后端 `validate_agent_env` 同一正则。 */
const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** 环境变量条数上限。 */
const MAX_ENV_COUNT = 200;
/** 键名最大长度。 */
const MAX_KEY_LENGTH = 128;
/** 值最大长度。 */
const MAX_VALUE_LENGTH = 32768;

type EnvRow = { key: string; value: string; locked: boolean };

type AgentEnvPanelProps = {
  /** 面板是否可见：环境变量只在打开时读取。 */
  active: boolean;
  notifySuccess: (message: string) => void;
  notifyError: (message: string) => void;
};

export const AgentEnvPanel = ({
  active,
  notifySuccess,
  notifyError,
}: AgentEnvPanelProps) => {
  const { env, isLoading } = useAgentEnv(active);
  const updateMutation = useUpdateAgentEnv();

  const [rows, setRows] = React.useState<EnvRow[]>([]);
  const [revealed, setRevealed] = React.useState<Set<string>>(new Set());

  // 服务端数据到达时合成行：已保存的键锁定键名（改键名等于删旧建新，参照的 locked-keys 口径）
  React.useEffect(() => {
    if (!env) return;
    setRows(
      Object.entries(env.env).map(([key, value]) => ({
        key,
        value,
        locked: true,
      })),
    );
  }, [env]);

  const dirty = React.useMemo(() => {
    const saved = env?.env ?? {};
    const current = Object.fromEntries(
      rows.filter((row) => row.key).map((row) => [row.key, row.value]),
    );
    const savedKeys = Object.keys(saved);
    const currentKeys = Object.keys(current);

    return (
      savedKeys.length !== currentKeys.length ||
      savedKeys.some((key) => saved[key] !== current[key]) ||
      currentKeys.some((key) => !(key in saved))
    );
  }, [env, rows]);

  const changeRow = (index: number, patch: Partial<EnvRow>) => {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  const addRow = () => {
    if (rows.length >= MAX_ENV_COUNT) {
      notifyError(`最多 ${MAX_ENV_COUNT} 条环境变量`);
      return;
    }
    setRows((current) => [...current, { key: '', value: '', locked: false }]);
  };

  const removeRow = (index: number) => {
    setRows((current) => current.filter((_, i) => i !== index));
  };

  const toggleReveal = (key: string) => {
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const validate = (): string | null => {
    const seen = new Set<string>();
    for (const row of rows) {
      const key = row.key.trim();
      if (!key && !row.value) continue;
      if (!key) return '环境变量名不能为空';
      if (!KEY_PATTERN.test(key)) {
        return '环境变量名只能包含字母、数字和下划线，且以字母或下划线开头';
      }
      if (key.length > MAX_KEY_LENGTH) {
        return `环境变量名最长 ${MAX_KEY_LENGTH} 个字符`;
      }
      if (seen.has(key)) return `环境变量名重复：${key}`;
      seen.add(key);
      if (row.value.length > MAX_VALUE_LENGTH) {
        return `环境变量值最长 ${MAX_VALUE_LENGTH} 个字符`;
      }
    }

    return null;
  };

  const handleSave = async () => {
    const error = validate();
    if (error) {
      notifyError(error);
      return;
    }

    const next: Record<string, string> = {};
    for (const row of rows) {
      const key = row.key.trim();
      if (key) next[key] = row.value;
    }

    try {
      await updateMutation.mutateAsync({ env: next });
      notifySuccess('环境变量已保存');
    } catch (error) {
      notifyError(
        error instanceof Error && error.message
          ? error.message
          : '保存环境变量失败',
      );
    }
  };

  if (!active) return null;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>环境变量</div>
          <p className={styles.description}>
            新建沙盒时会注入这些变量，并覆盖同名全局 sandbox.env。
          </p>
        </div>
        <Button
          type="primary"
          disabled={!dirty}
          loading={updateMutation.isPending}
          onClick={() => void handleSave()}
        >
          {dirty ? '保存' : '已保存'}
        </Button>
      </div>

      <Alert
        type="info"
        showIcon
        message="已保存的变量只对之后新建的沙盒生效，已有沙盒不受影响。"
      />

      {isLoading ? (
        <div className={styles.center}>
          <Spin />
        </div>
      ) : (
        <div className={styles.rows}>
          {rows.map((row, index) => {
            const revealKey = row.locked ? row.key : `new-${index}`;
            const revealedValue = revealed.has(revealKey);
            return (
              <div key={revealKey} className={styles.row}>
                <Input
                  className={styles.keyInput}
                  placeholder="变量名"
                  aria-label={`环境变量名 ${index + 1}`}
                  maxLength={MAX_KEY_LENGTH}
                  value={row.key}
                  disabled={row.locked}
                  onChange={(event) =>
                    changeRow(index, { key: event.target.value })
                  }
                />
                <Input
                  className={styles.valueInput}
                  placeholder="变量值"
                  aria-label={`环境变量值 ${index + 1}`}
                  maxLength={MAX_VALUE_LENGTH}
                  type={revealedValue ? 'text' : 'password'}
                  value={row.value}
                  onChange={(event) =>
                    changeRow(index, { value: event.target.value })
                  }
                />
                <Button
                  type="text"
                  size="small"
                  aria-label={revealedValue ? '隐藏变量值' : '显示变量值'}
                  icon={
                    revealedValue ? (
                      <EyeOff size={14} aria-hidden />
                    ) : (
                      <Eye size={14} aria-hidden />
                    )
                  }
                  onClick={() => toggleReveal(revealKey)}
                />
                {/* 参照的每行都有删除（删行=从保存 payload 里去掉这个键）；锁定只冻结键名与值显隐 */}
                <Tooltip
                  title={
                    row.locked ? '删除已保存变量（保存后生效）' : '删除变量'
                  }
                >
                  <Button
                    type="text"
                    size="small"
                    danger
                    aria-label={`删除 ${row.key || '未命名变量'}`}
                    icon={<Trash2 size={14} aria-hidden />}
                    onClick={() => removeRow(index)}
                  />
                </Tooltip>
              </div>
            );
          })}
        </div>
      )}

      <Button
        icon={<Plus size={14} aria-hidden />}
        disabled={updateMutation.isPending}
        onClick={addRow}
      >
        新增变量
      </Button>
    </div>
  );
};
