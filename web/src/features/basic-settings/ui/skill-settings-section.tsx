/** Skill 配置区块。 */
import * as React from 'react';
import { Pencil } from 'lucide-react';

import { Button, Select } from 'antd';

import {
  useConfigOptions,
  useUpdateConfigOption,
} from '@/entities/system-config';
import { describeFailure } from '@/shared/api';

import styles from './basic-settings-panel.module.css';

/** 远程 Skill 来源白名单的配置项键。 */
const SOURCE_OPTION_KEY = 'remote_skill_source_policy';

type SkillSettingsSectionProps = {
  notifySuccess: (message: string) => void;
  notifyError: (message: string) => void;
};

export const SkillSettingsSection = ({
  notifySuccess,
  notifyError,
}: SkillSettingsSectionProps) => {
  const { options, isLoading } = useConfigOptions();
  const updateOption = useUpdateConfigOption();

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);

  const sourceOption = options.find(
    (option) => option.key === SOURCE_OPTION_KEY,
  );
  const field = sourceOption?.fields[0];

  /** 已保存值；没保存过时用后端定义的默认值。 */
  const hosts = React.useMemo(() => {
    if (!sourceOption || !field) return [];
    const saved = sourceOption.value[field.key];
    if (Array.isArray(saved)) {
      return saved.filter((item): item is string => typeof item === 'string');
    }

    return Array.isArray(field.defaultValue)
      ? field.defaultValue.filter(
          (item): item is string => typeof item === 'string',
        )
      : [];
  }, [field, sourceOption]);

  const startEditing = () => {
    setDraft([...hosts]);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setDraft([]);
  };

  const save = async () => {
    if (!field) return;
    setSaving(true);
    try {
      await updateOption.mutateAsync({
        key: SOURCE_OPTION_KEY,
        value: { [field.key]: draft },
      });
      cancelEditing();
      notifySuccess('Skill 来源配置已保存');
    } catch (failure) {
      notifyError(describeFailure(failure, '保存 Skill 配置失败'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.skillSection}>
      <div className={styles.sectionTitle}>Skill 配置</div>

      <section className={styles.sourcePanel}>
        {!sourceOption || !field ? (
          <div className={styles.panelState}>
            {isLoading ? '正在加载配置…' : '远程 Skill 来源配置尚未初始化'}
          </div>
        ) : (
          <>
            <div className={styles.sourceHeader}>
              <div className={styles.sourceCopy}>
                <h4>远程来源白名单</h4>
                <p>只有列表中的域名可以远程加载和安装 Skill。</p>
              </div>
              {editing ? null : (
                <Button
                  type="text"
                  size="small"
                  icon={<Pencil size={14} aria-hidden />}
                  onClick={startEditing}
                >
                  编辑
                </Button>
              )}
            </div>

            {editing ? (
              <div className={styles.sourceContent}>
                <Select
                  mode="tags"
                  className={styles.domainSelect}
                  aria-label={field.label}
                  value={draft}
                  onChange={setDraft}
                  tokenSeparators={[',', ' ', '\n']}
                  placeholder="输入域名后按回车，例如 github.com"
                  options={[]}
                />
                <div className={styles.editFooter}>
                  <span>精确匹配域名；清空并保存会关闭远程安装。</span>
                  <div className={styles.editActions}>
                    <Button
                      size="small"
                      disabled={saving}
                      onClick={cancelEditing}
                    >
                      取消
                    </Button>
                    <Button
                      type="primary"
                      size="small"
                      loading={saving}
                      onClick={() => void save()}
                    >
                      保存
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className={styles.sourceContent}>
                {hosts.length ? (
                  <div className={styles.hostList} aria-label="允许的来源域名">
                    {hosts.map((host) => (
                      <span key={host} className={styles.hostTag}>
                        {host}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className={styles.panelState}>
                    未配置域名，远程安装已关闭
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
};
