/**
 * 账户设置分区。
 *
 * 对齐参照 `AccountSettingsComponent.vue`：gray-25 资料卡片、80px 圆头像悬停遮罩（无头像
 * 「上传」/有头像「更换」）、用户名与手机号行内编辑（Enter 保存、Esc/失焦取消）、UID/权限/
 * 部门只读、底部「是否启用 Memory」开关。文案逐字对齐参照。
 *
 * 与参照的显式偏离（见决策记录）：头像兜底用首字母渐变，不走 DiceBear 外部头像。
 * 弹窗外壳（导航、关闭钮）由 `SettingsModal` 统一拥有，这里只渲染分区内容。
 */
import * as React from 'react';
import { Building2, RefreshCw, ShieldCheck, Upload } from 'lucide-react';

import { Button, Input, Spin, Switch, type InputRef } from 'antd';

import { avatarBackground, avatarInitials } from '@/shared/lib';

import { useAccountSettings } from '../model/use-account-settings';
import { roleValueColor } from '../lib/account-settings';

import styles from './account-section.module.css';

type AccountSectionProps = {
  /** 分区是否激活：Memory 配置只在激活时读取。 */
  active: boolean;
  notifySuccess: (message: string) => void;
  notifyError: (message: string) => void;
};

export const AccountSection = ({
  active,
  notifySuccess,
  notifyError,
}: AccountSectionProps) => {
  const settings = useAccountSettings({
    open: active,
    notifySuccess,
    notifyError,
  });

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const usernameInputRef = React.useRef<InputRef | null>(null);

  const user = settings.user;
  const avatar = user?.avatar ?? '';
  const editing = settings.editingField;
  const isEditing = (field: 'username' | 'phone_number') =>
    editing === field && !settings.savingField;

  // 进编辑态时把焦点交给输入框（参照的 nextTick + focus）
  React.useEffect(() => {
    if (editing) usernameInputRef.current?.focus();
  }, [editing]);

  const renderFieldValue = (
    field: 'username' | 'phone_number',
    label: string,
    value: string,
  ) => {
    if (isEditing(field)) {
      return (
        <Input
          ref={usernameInputRef}
          size="small"
          maxLength={field === 'username' ? 20 : 11}
          className={styles.inlineInput}
          aria-label={label}
          value={settings.draft}
          disabled={settings.savingField === field}
          onChange={(event) => settings.changeDraft(event.target.value)}
          onPressEnter={() => void settings.submitEditing()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              event.preventDefault();
              settings.cancelEditing();
            }
          }}
          onBlur={settings.cancelEditing}
        />
      );
    }

    return (
      <button
        type="button"
        className={styles.editableValue}
        title={value || '未设置'}
        onClick={() => settings.startEditing(field)}
      >
        {value || '未设置'}
      </button>
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>账户设置</div>
          <p className={styles.description}>管理当前账户资料、身份信息。</p>
        </div>
        <Button
          icon={
            <RefreshCw
              size={14}
              aria-hidden
              className={settings.refreshing ? styles.spinning : ''}
            />
          }
          loading={settings.refreshing}
          onClick={() => void settings.refresh()}
        >
          刷新
        </Button>
      </div>

      <div className={styles.card}>
        <div className={styles.summary}>
          <div className={styles.left}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void settings.uploadAvatar(file);
              }}
            />
            <button
              type="button"
              className={`${styles.avatarUpload} ${
                settings.avatarUploading ? styles.avatarUploadingNow : ''
              }`}
              aria-label={avatar ? '更换头像' : '上传头像'}
              onClick={() => fileInputRef.current?.click()}
            >
              {avatar ? (
                <img
                  src={avatar}
                  alt={user?.username ?? ''}
                  className={styles.avatarImage}
                />
              ) : (
                <span
                  className={styles.avatarFallback}
                  style={{ background: avatarBackground(user?.uid ?? '') }}
                  aria-hidden
                >
                  {avatarInitials(user?.username ?? '')}
                </span>
              )}
              <span className={styles.avatarMask}>
                {settings.avatarUploading ? (
                  <RefreshCw
                    size={16}
                    className={styles.spinning}
                    aria-hidden
                  />
                ) : (
                  <Upload size={16} aria-hidden />
                )}
                <span>{avatar ? '更换' : '上传'}</span>
              </span>
            </button>

            <div className={styles.fields}>
              <div className={styles.row}>
                <span className={styles.label}>用户名</span>
                {renderFieldValue('username', '用户名', user?.username ?? '')}
              </div>
              <div className={styles.row}>
                <span className={styles.label}>手机号</span>
                {renderFieldValue(
                  'phone_number',
                  '手机号',
                  user?.phone_number ?? '',
                )}
              </div>
              <div className={styles.row}>
                <span className={styles.label}>UID</span>
                <span className={`${styles.value} ${styles.mono}`}>
                  {user?.uid || '未设置'}
                </span>
              </div>
            </div>
          </div>

          <div className={styles.identity}>
            <div className={styles.identityItem}>
              <span className={styles.identityIcon}>
                <ShieldCheck size={15} aria-hidden />
              </span>
              <span className={styles.label}>权限</span>
              <span
                className={styles.value}
                style={{ color: roleValueColor(user?.role) }}
              >
                {roleText(user?.role)}
              </span>
            </div>
            <div className={styles.identityItem}>
              <span className={styles.identityIcon}>
                <Building2 size={15} aria-hidden />
              </span>
              <span className={styles.label}>部门</span>
              <span className={styles.value}>
                {user?.department_name || '默认部门'}
              </span>
            </div>
          </div>
        </div>

        <div className={styles.configPanel}>
          {settings.memoryLoading && settings.memoryEnabled === undefined ? (
            <Spin size="small" />
          ) : null}
          <div className={styles.configRow}>
            <span className={styles.configTitle}>是否启用 Memory</span>
            <Switch
              aria-label="是否启用 Memory"
              checked={settings.memoryEnabled === true}
              loading={settings.memorySaving}
              onChange={(checked) => void settings.changeMemory(checked)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

/** 角色 → 文案；与参照的 `userRoleText` 同表。 */
const roleText = (role: string | null | undefined): string => {
  switch (role) {
    case 'superadmin':
      return '超级管理员';
    case 'admin':
      return '管理员';
    case 'user':
      return '普通用户';
    default:
      return '未知角色';
  }
};
