/** 基本设置分区。 */
import * as React from 'react';
import { Globe } from 'lucide-react';

import { Button, Spin, Switch } from 'antd';

import { useIsSuperuser } from '@/entities/session';

import { useBasicSettings } from '../model/use-basic-settings';
import { ModelSelectField } from './model-select-field';
import { SkillSettingsSection } from './skill-settings-section';

import styles from './basic-settings-panel.module.css';

/** 服务链接；端口与 docker-compose 的映射一致。 */
const SERVICE_LINKS = [
  {
    name: 'Neo4j 浏览器',
    description: '图数据库管理界面',
    url: 'http://localhost:7474/',
  },
  {
    name: 'API 接口文档',
    description: '系统接口文档和调试工具',
    url: 'http://localhost:5050/docs',
  },
  {
    name: 'MinIO 对象存储',
    description: '文件存储管理控制台',
    url: 'http://localhost:9001',
  },
  {
    name: 'Milvus WebUI',
    description: '向量数据库管理界面',
    url: 'http://localhost:9091/webui/',
  },
];

type BasicSettingsPanelProps = {
  notifySuccess: (message: string) => void;
  notifyError: (message: string) => void;
};

export const BasicSettingsPanel = ({
  notifySuccess,
  notifyError,
}: BasicSettingsPanelProps) => {
  const isSuperuser = useIsSuperuser();
  const settings = useBasicSettings({ notifyError });

  if (settings.isLoading) {
    return (
      <div className={styles.center}>
        <Spin />
      </div>
    );
  }

  const contentGuard = settings.boolValue('enable_content_guard');
  const contentGuardLlm = settings.boolValue('enable_content_guard_llm');

  return (
    <div className={styles.panel}>
      {isSuperuser ? (
        <>
          <div className={styles.sectionTitle}>默认项配置</div>
          <div className={styles.settingsPanel}>
            <div className={styles.settingRow}>
              <div className={styles.colItem}>
                <div className={styles.settingLabel}>
                  {settings.labelOf('default_model', '默认对话模型')}
                </div>
                <ModelSelectField
                  modelType="chat"
                  placeholder="请选择默认模型"
                  value={settings.stringValue('default_model')}
                  disabled={settings.saving}
                  onChange={(spec) =>
                    void settings.setValue('default_model', spec)
                  }
                />
              </div>
              <div className={styles.colItem}>
                <div className={styles.settingLabel}>
                  {settings.labelOf('fast_model', '快速响应模型')}
                </div>
                <ModelSelectField
                  modelType="chat"
                  placeholder="请选择模型"
                  value={settings.stringValue('fast_model')}
                  disabled={settings.saving}
                  onChange={(spec) =>
                    void settings.setValue('fast_model', spec)
                  }
                />
              </div>
            </div>

            <div className={styles.settingRow}>
              <div className={styles.colItem}>
                <div className={styles.settingLabel}>
                  {settings.labelOf('embed_model', '默认 Embedding 模型')}
                </div>
                <ModelSelectField
                  modelType="embedding"
                  placeholder="请选择嵌入模型"
                  value={settings.stringValue('embed_model')}
                  disabled={settings.saving}
                  onChange={(spec) =>
                    void settings.setValue('embed_model', spec)
                  }
                />
              </div>
              <div className={styles.colItem}>
                <div className={styles.settingLabel}>
                  {settings.labelOf('reranker', '默认 Re-Ranker 模型')}
                </div>
                <ModelSelectField
                  modelType="rerank"
                  placeholder="请选择重排序模型"
                  value={settings.stringValue('reranker')}
                  disabled={settings.saving}
                  onChange={(spec) => void settings.setValue('reranker', spec)}
                />
              </div>
            </div>
          </div>

          <div className={styles.sectionTitle}>内容审查配置</div>
          <div className={styles.section}>
            <div className={styles.card}>
              <span className={styles.cardLabel}>
                {settings.labelOf('enable_content_guard', '是否启用内容审查')}
              </span>
              <Switch
                aria-label="是否启用内容审查"
                checked={contentGuard}
                loading={settings.saving}
                onChange={(checked) =>
                  void settings.setValue('enable_content_guard', checked)
                }
              />
            </div>

            {contentGuard ? (
              <div className={styles.card}>
                <span className={styles.cardLabel}>
                  {settings.labelOf(
                    'enable_content_guard_llm',
                    '是否启用 LLM 内容审查',
                  )}
                </span>
                <Switch
                  aria-label="是否启用 LLM 内容审查"
                  checked={contentGuardLlm}
                  loading={settings.saving}
                  onChange={(checked) =>
                    void settings.setValue('enable_content_guard_llm', checked)
                  }
                />
              </div>
            ) : null}

            {contentGuard && contentGuardLlm ? (
              <div className={styles.cardSelect}>
                <span className={styles.cardLabel}>
                  {settings.labelOf(
                    'content_guard_llm_model',
                    '内容审查 LLM 模型',
                  )}
                </span>
                <ModelSelectField
                  modelType="chat"
                  placeholder="请选择模型"
                  value={settings.stringValue('content_guard_llm_model')}
                  disabled={settings.saving}
                  onChange={(spec) =>
                    void settings.setValue('content_guard_llm_model', spec)
                  }
                />
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      <SkillSettingsSection
        notifySuccess={notifySuccess}
        notifyError={notifyError}
      />

      <div className={styles.sectionTitle}>服务链接</div>
      <p className={styles.sectionDescription}>
        快速访问系统相关的外部服务，需要将 localhost 替换为实际的 IP 地址。
      </p>
      <div className={styles.servicesGrid}>
        {SERVICE_LINKS.map((service) => (
          <div key={service.name} className={styles.serviceLinkCard}>
            <div className={styles.serviceInfo}>
              <h4>{service.name}</h4>
              <p>{service.description}</p>
            </div>
            <Button
              href={service.url}
              target="_blank"
              rel="noopener noreferrer"
              icon={<Globe size={18} aria-hidden />}
            >
              访问
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};
