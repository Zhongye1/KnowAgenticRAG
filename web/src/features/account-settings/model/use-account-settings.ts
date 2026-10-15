/** 账户设置弹窗的控制器。 */
import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  refreshAccountData,
  useUpdateProfile,
  useUpdateUserConfig,
  useUploadAvatar,
  useUser,
  useUserConfig,
} from '@/entities/session';
import { describeFailure } from '@/shared/api';
import { validatePhoneNumber, validateUsername } from '@/shared/lib';

import { validateAvatarFile } from '../lib/account-settings';

/** 可编辑字段；同时只允许一个。 */
export type EditableField = 'username' | 'phone_number';

export type AccountSettingsInput = {
  /** 弹窗是否打开：Memory 配置只在打开时读取。 */
  open: boolean;
  /** 成功文案。 */
  notifySuccess: (message: string) => void;
  /** 失败与拦截文案。 */
  notifyError: (message: string) => void;
};

export type AccountSettings = {
  user: ReturnType<typeof useUser>['data'];

  /** 正在编辑的字段；null 表示都在展示态。 */
  editingField: EditableField | null;
  /** 编辑草稿；切进编辑态时同步为当前值。 */
  draft: string;
  /** 正在保存的字段；该字段输入框禁用，且失焦不取消。 */
  savingField: EditableField | null;
  startEditing: (field: EditableField) => void;
  cancelEditing: () => void;
  changeDraft: (value: string) => void;
  /** Enter 提交；校验失败提示并保持编辑态，未变更静默取消。 */
  submitEditing: () => Promise<void>;

  avatarUploading: boolean;
  /** 上传头像；先过客户端校验，再走真实端点。 */
  uploadAvatar: (file: File) => Promise<void>;

  /** Memory 草稿；undefined 表示配置还没读到。 */
  memoryEnabled: boolean | undefined;
  /** 配置正在读取（打开弹窗后的首次取数）。 */
  memoryLoading: boolean;
  memorySaving: boolean;
  changeMemory: (enabled: boolean) => Promise<void>;

  refreshing: boolean;
  refresh: () => Promise<void>;
};

export function useAccountSettings(
  input: AccountSettingsInput,
): AccountSettings {
  const { open, notifySuccess, notifyError } = input;
  const queryClient = useQueryClient();

  const user = useUser();
  const config = useUserConfig(open);

  const [editingField, setEditingField] = React.useState<EditableField | null>(
    null,
  );
  const [draft, setDraft] = React.useState('');
  const [savingField, setSavingField] = React.useState<EditableField | null>(
    null,
  );
  const [avatarUploading, setAvatarUploading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const updateProfile = useUpdateProfile();
  const uploadMutation = useUploadAvatar();
  const updateConfig = useUpdateUserConfig();

  // 编辑态是弹窗的本地状态：关闭即复位，重开时从最新资料开始
  React.useEffect(() => {
    if (open) return;
    setEditingField(null);
    setSavingField(null);
    setDraft('');
  }, [open]);

  const currentFieldValue = (field: EditableField): string => {
    if (field === 'username') return user.data?.username ?? '';
    return user.data?.phone_number ?? '';
  };

  const startEditing = React.useCallback(
    (field: EditableField) => {
      if (savingField) return;
      setDraft(currentFieldValue(field));
      setEditingField(field);
    },
    // currentFieldValue 只依赖 user.data；user 对象引用每次渲染都变
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [savingField, user.data?.username, user.data?.phone_number],
  );

  /** 失焦取消；保存中的字段不能被失焦关掉。 */
  const cancelEditing = React.useCallback(() => {
    if (savingField) return;
    setEditingField(null);
    setDraft('');
  }, [savingField]);

  const changeDraft = React.useCallback((value: string) => {
    setDraft(value);
  }, []);

  const submitEditing = React.useCallback(async () => {
    const field = editingField;
    if (!field || savingField) return;

    const value = draft.trim();
    if (field === 'username') {
      const error = validateUsername(value);
      if (error) {
        notifyError(error);
        return;
      }
      if (value === (user.data?.username ?? '')) {
        cancelEditing();
        return;
      }
    } else {
      const error = validatePhoneNumber(value);
      if (error) {
        notifyError(error);
        return;
      }
      if (value === (user.data?.phone_number ?? '')) {
        cancelEditing();
        return;
      }
    }

    setSavingField(field);
    try {
      await updateProfile.mutateAsync(
        field === 'username'
          ? { username: value }
          : { phone_number: value || null },
      );
      notifySuccess('个人资料更新成功');
      setEditingField(null);
      setDraft('');
    } catch (error) {
      notifyError(`更新失败：${describeFailure(error, '请稍后重试')}`);
    } finally {
      setSavingField(null);
    }
  }, [
    cancelEditing,
    draft,
    editingField,
    notifyError,
    notifySuccess,
    updateProfile,
    user.data?.phone_number,
    user.data?.username,
    savingField,
  ]);

  const uploadAvatar = React.useCallback(
    async (file: File) => {
      if (avatarUploading) return;

      const error = validateAvatarFile(file);
      if (error) {
        notifyError(error);
        return;
      }

      setAvatarUploading(true);
      try {
        await uploadMutation.mutateAsync(file);
        notifySuccess('头像上传成功！');
      } catch (error) {
        notifyError(`头像上传失败：${describeFailure(error, '请稍后重试')}`);
      } finally {
        setAvatarUploading(false);
      }
    },
    [avatarUploading, notifyError, notifySuccess, uploadMutation],
  );

  const memoryEnabled = config.data?.enableMemory;
  const changeMemory = React.useCallback(
    async (enabled: boolean) => {
      if (updateConfig.isPending) return;
      try {
        // 开关先翻再发请求；失败不回滚，重开弹窗时按服务端状态重读
        await updateConfig.mutateAsync({ enableMemory: enabled });
        notifySuccess('用户配置已保存');
      } catch (error) {
        notifyError(describeFailure(error, '保存用户配置失败'));
      }
    },
    [notifySuccess, notifyError, updateConfig],
  );

  const refresh = React.useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      refreshAccountData(queryClient);
      notifySuccess('账户设置已刷新');
    } finally {
      setRefreshing(false);
    }
  }, [notifySuccess, queryClient, refreshing]);

  return {
    user: user.data,
    editingField,
    draft,
    savingField,
    startEditing,
    cancelEditing,
    changeDraft,
    submitEditing,
    avatarUploading,
    uploadAvatar,
    memoryEnabled,
    memoryLoading: open && config.isPending,
    memorySaving: updateConfig.isPending,
    changeMemory,
    refreshing,
    refresh,
  };
}
