/**
 * 共享设置弹窗。
 *
 * 表单与纯规则在 `shared/ui/share-config-form.tsx` 与 `shared/lib/share-config.ts`
 * （技能安装流与技能详情页共用同一套），这里只保留知识库自己的弹窗外壳与保存动作。
 * 保存走后端唯一的写入口 `PUT /databases/{kb_id}`，该端点要求名称与描述齐全，
 * 因此提交时会一并带上当前值。
 */
import * as React from 'react';
import { Button, Modal } from 'antd';
import { useNotifications } from '@/shared/ui/notifications';

import type { KnowledgeBaseDetail } from '../api/knowledge-api';
import {
  useShareTargets,
  useUpdateKnowledgeBase,
} from '../model/knowledge-queries';
import {
  normalizeShareConfig,
  validateShareConfig,
  type ShareConfig,
} from '@/shared/lib/share-config';
import { ShareConfigForm } from '@/shared/ui/share-config-form';

type ShareConfigDialogProps = {
  kb: KnowledgeBaseDetail;
  onOpenChange: (open: boolean) => void;
};

export const ShareConfigDialog = ({
  kb,
  onOpenChange,
}: ShareConfigDialogProps) => {
  const targets = useShareTargets();
  const update = useUpdateKnowledgeBase(kb.kb_id);
  const notifications = useNotifications();

  const [config, setConfig] = React.useState<ShareConfig>(() =>
    normalizeShareConfig(kb.share_config),
  );
  const [error, setError] = React.useState('');

  const onChange = (next: ShareConfig) => {
    // 改选择即失效上一次的校验或保存失败提示，否则要再点一次保存才消失
    setError('');
    setConfig(next);
  };

  const onSave = async () => {
    const invalid = validateShareConfig(config);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError('');
    try {
      await update.mutateAsync({
        name: kb.name,
        description: kb.description ?? '',
        share_config: config,
      });
      notifications.addNotification({
        type: 'success',
        title: '知识库',
        message: '共享范围已保存。',
      });
      onOpenChange(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : '保存共享范围失败。',
      );
    }
  };

  return (
    <Modal open onCancel={() => onOpenChange(false)} footer={null}>
      title=
      {
        <div>
          <div>共享设置</div>
          <div className="text-xs font-normal text-color-text-3">
            控制谁能读取这个知识库，以及谁还能继续共享它。管理范围必须落在读取范围内。
          </div>
        </div>
      }
      <ShareConfigForm
        value={config}
        onChange={onChange}
        error={error}
        departments={(targets.data?.departments ?? []).map((item) => ({
          value: item.id,
          label: item.name,
        }))}
        users={(targets.data?.users ?? []).map((item) => ({
          value: item.uid,
          label: item.department_name
            ? `${item.username}（${item.department_name}）`
            : item.username,
        }))}
        targetsLoading={targets.isPending}
      />
      <div>
        <Button
          htmlType="button"
          variant="outlined"
          disabled={update.isPending}
          onClick={() => onOpenChange(false)}
        >
          取消
        </Button>
        <Button
          htmlType="button"
          disabled={update.isPending}
          onClick={() => void onSave()}
        >
          {update.isPending ? '保存中…' : '保存'}
        </Button>
      </div>
    </Modal>
  );
};
