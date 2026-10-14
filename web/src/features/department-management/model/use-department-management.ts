/**
 * 部门管理面板的状态与动作。
 *
 * 面板只负责渲染，状态机在这里：列表走 `useDepartments` 的缓存，弹窗持有创建/编辑表单，
 * UID 重名预检在失焦时异步做（带请求序号，避免旧响应盖掉新输入）。
 */
import * as React from 'react';

import {
  useCreateDepartment,
  useDeleteDepartment,
  useDepartments,
  useUpdateDepartment,
  type Department,
} from '@/entities/department';
import { checkUidAvailable } from '@/entities/user-admin';
import { describeFailure } from '@/shared/api';
import { useConfirm } from '@/shared/ui/confirm-dialog';

import {
  validateAdminPhone,
  validateAdminUid,
  validateDepartmentForm,
  type DepartmentFormValues,
} from '../lib/department-form';

const EMPTY_FORM: DepartmentFormValues = {
  name: '',
  description: '',
  adminUid: '',
  adminPassword: '',
  adminConfirmPassword: '',
  adminPhone: '',
};

export type DepartmentManagement = {
  departments: Department[];
  isLoading: boolean;
  refreshing: boolean;
  /** 弹窗是否打开。 */
  modalOpen: boolean;
  /** 当前是编辑已有部门（非创建）。 */
  editing: boolean;
  /** 编辑目标；创建时为 null。 */
  editingId: number | null;
  values: DepartmentFormValues;
  /** UID 预检结论；null 表示没有错误。 */
  uidError: string | null;
  phoneError: string | null;
  checkingUid: boolean;
  saving: boolean;
  refresh: () => Promise<void>;
  openCreate: () => void;
  openEdit: (department: Department) => void;
  closeModal: () => void;
  changeValue: (patch: Partial<DepartmentFormValues>) => void;
  /** 失焦时预检 UID 是否被占用。 */
  checkUid: () => Promise<void>;
  submit: () => Promise<void>;
  remove: (department: Department) => Promise<void>;
};

export const useDepartmentManagement = (options: {
  notifySuccess: (message: string) => void;
  notifyError: (message: string) => void;
}): DepartmentManagement => {
  const { notifySuccess, notifyError } = options;
  const { departments, isLoading, refetch } = useDepartments();
  const createMutation = useCreateDepartment();
  const updateMutation = useUpdateDepartment();
  const deleteMutation = useDeleteDepartment();
  const { confirm } = useConfirm();

  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [values, setValues] = React.useState<DepartmentFormValues>(EMPTY_FORM);
  const [uidError, setUidError] = React.useState<string | null>(null);
  const [phoneError, setPhoneError] = React.useState<string | null>(null);
  const [checkingUid, setCheckingUid] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  // 预检的请求序号：晚到的旧响应不覆盖新输入
  const uidRequestRef = React.useRef(0);

  const editing = editingId !== null;

  const changeValue = React.useCallback(
    (patch: Partial<DepartmentFormValues>) => {
      setValues((current) => ({ ...current, ...patch }));
      if (patch.adminPhone !== undefined) {
        setPhoneError(validateAdminPhone(patch.adminPhone.trim()));
      }
      if (patch.adminUid !== undefined) {
        // 改动 UID 后旧的预检结论作废
        uidRequestRef.current += 1;
        setUidError(null);
        setCheckingUid(false);
      }
    },
    [],
  );

  const openCreate = React.useCallback(() => {
    uidRequestRef.current += 1;
    setEditingId(null);
    setValues(EMPTY_FORM);
    setUidError(null);
    setPhoneError(null);
    setModalOpen(true);
  }, []);

  const openEdit = React.useCallback((department: Department) => {
    uidRequestRef.current += 1;
    setEditingId(department.id);
    setValues({
      ...EMPTY_FORM,
      name: department.name,
      description: department.description,
    });
    setUidError(null);
    setPhoneError(null);
    setModalOpen(true);
  }, []);

  const closeModal = React.useCallback(() => {
    uidRequestRef.current += 1;
    setModalOpen(false);
  }, []);

  const checkUid = React.useCallback(async () => {
    const uid = values.adminUid.trim();
    if (!uid || editingId !== null) return;

    const staticError = validateAdminUid(uid);
    if (staticError) {
      setUidError(staticError);
      return;
    }

    const requestId = uidRequestRef.current + 1;
    uidRequestRef.current = requestId;
    setCheckingUid(true);
    try {
      const available = await checkUidAvailable(uid);
      if (uidRequestRef.current !== requestId) return;
      setUidError(available ? null : '该UID已被使用');
    } catch {
      // 预检失败不拦提交：后端在创建时会再判一次重名
      if (uidRequestRef.current === requestId) setUidError(null);
    } finally {
      if (uidRequestRef.current === requestId) setCheckingUid(false);
    }
  }, [editingId, values.adminUid]);

  const refresh = React.useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refetch();
      notifySuccess('刷新成功');
    } finally {
      setRefreshing(false);
    }
  }, [notifySuccess, refetch, refreshing]);

  const submit = React.useCallback(async () => {
    const error = validateDepartmentForm(values, { editing });
    if (error) {
      notifyError(error);
      return;
    }
    if (!editing && uidError) {
      notifyError('管理员UID已存在或格式错误');
      return;
    }

    setSaving(true);
    try {
      const name = values.name.trim();
      const description = values.description.trim();
      if (editingId !== null) {
        await updateMutation.mutateAsync({
          id: editingId,
          input: {
            name,
            ...(description ? { description } : {}),
          },
        });
        notifySuccess('部门更新成功');
      } else {
        const adminUid = values.adminUid.trim();
        const adminPhone = values.adminPhone.trim();
        await createMutation.mutateAsync({
          name,
          ...(description ? { description } : {}),
          adminUid,
          adminPassword: values.adminPassword,
          ...(adminPhone ? { adminPhone } : {}),
        });
        notifySuccess(`部门创建成功，管理员 "${adminUid}" 已创建`);
      }

      setModalOpen(false);
    } catch (failure) {
      notifyError(`操作失败：${describeFailure(failure, '请稍后重试')}`);
    } finally {
      setSaving(false);
    }
  }, [
    createMutation,
    editing,
    editingId,
    notifyError,
    notifySuccess,
    uidError,
    updateMutation,
    values,
  ]);

  const remove = React.useCallback(
    async (department: Department) => {
      const confirmed = await confirm({
        title: '确认删除部门',
        description:
          `确定要删除部门 "${department.name}" 吗？此操作不可撤销。` +
          '该部门下的用户会被迁移到默认部门，部门级配置和部门 API Key 会一并清理。',
        confirmText: '删除',
        cancelText: '取消',
        destructive: true,
      });
      if (!confirmed) return;

      try {
        await deleteMutation.mutateAsync(department.id);
        notifySuccess('部门删除成功');
      } catch (failure) {
        notifyError(`删除失败：${describeFailure(failure, '请稍后重试')}`);
      }
    },
    [confirm, deleteMutation, notifyError, notifySuccess],
  );

  return {
    departments,
    isLoading,
    refreshing,
    modalOpen,
    editing,
    editingId,
    values,
    uidError,
    phoneError,
    checkingUid,
    saving,
    refresh,
    openCreate,
    openEdit,
    closeModal,
    changeValue,
    checkUid,
    submit,
    remove,
  };
};
