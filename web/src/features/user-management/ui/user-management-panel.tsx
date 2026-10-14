/**
 * 用户管理分区。
 *
 * 对齐参照 `UserManagementComponent.vue`：头部（标题 + 说明 + 刷新 + 添加用户）、筛选行
 * （搜索 + 部门 + 权限）、六列表格（用户 / 角色 / 所属部门 / 手机号 / 最后登录 / 操作）、
 * 分页器与增删改弹窗。删除自己与删除超管在界面上先禁用，后端仍会再判一次。
 *
 * 与参照的显式偏离（见决策记录）：表格用原生 `table` + CSS Module 复刻参照的 antd 表格外观；
 * 头像兜底用首字母渐变而不是 DiceBear 外部头像（与账户设置同口径）。
 */
import * as React from 'react';
import {
  Plus,
  RefreshCw,
  Search,
  SquarePen,
  Trash2,
  User as UserIcon,
  UserLock,
  UserStar,
} from 'lucide-react';

import {
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Pagination,
  Select,
  Spin,
  Tooltip,
} from 'antd';

import { formatUserRole, MIN_PASSWORD_LENGTH } from '@/entities/session';
import type { ManagedUser } from '@/entities/user-admin';
import {
  avatarBackground,
  avatarInitials,
  formatMinuteStamp,
} from '@/shared/lib';

import {
  MAX_PASSWORD_LENGTH,
  MAX_PHONE_LENGTH,
  PAGE_SIZE_OPTIONS,
  ROLE_FILTER_OPTIONS,
} from '../lib/user-management';
import { useUserManagement } from '../model/use-user-management';

import styles from './user-management-panel.module.css';

type UserManagementPanelProps = {
  notifySuccess: (message: string) => void;
  notifyError: (message: string) => void;
};

export const UserManagementPanel = ({
  notifySuccess,
  notifyError,
}: UserManagementPanelProps) => {
  const panel = useUserManagement({ notifySuccess, notifyError });

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>用户管理</div>
          <p className={styles.description}>
            管理系统用户，请谨慎操作。删除用户后该用户将无法登录系统。
          </p>
        </div>
        <div className={styles.actions}>
          <Button
            icon={
              <RefreshCw
                size={16}
                aria-hidden
                className={panel.refreshing ? styles.spinning : ''}
              />
            }
            title="刷新"
            loading={panel.refreshing}
            onClick={() => void panel.refresh()}
          />
          <Button
            type="primary"
            icon={<Plus size={16} aria-hidden />}
            onClick={panel.openCreate}
          >
            添加用户
          </Button>
        </div>
      </div>

      <div className={styles.filters}>
        <Input
          className={styles.search}
          placeholder="搜索用户名 / ID / 手机号"
          allowClear
          prefix={<Search size={16} aria-hidden />}
          value={panel.searchInput}
          onChange={(event) => panel.setSearchInput(event.target.value)}
        />
        <div className={styles.filterActions}>
          <Select
            className={styles.filterSelect}
            value={panel.departmentFilter}
            onChange={panel.setDepartmentFilter}
            options={[
              { value: '', label: '全部部门' },
              ...panel.departmentOptions,
            ]}
          />
          <Select
            className={styles.filterSelect}
            value={panel.roleFilter}
            onChange={panel.setRoleFilter}
            options={ROLE_FILTER_OPTIONS}
          />
        </div>
      </div>

      {panel.isLoading ? (
        <div className={styles.center}>
          <Spin />
        </div>
      ) : panel.users.length ? (
        <>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.userCol}>用户</th>
                  <th className={styles.roleCol}>角色</th>
                  <th className={styles.deptCol}>所属部门</th>
                  <th className={styles.phoneCol}>手机号</th>
                  <th className={styles.loginCol}>最后登录</th>
                  <th className={styles.actionCol}>操作</th>
                </tr>
              </thead>
              <tbody>
                {panel.users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <span className={styles.userCell}>
                        <UserAvatar user={user} />
                        <span className={styles.userMeta}>
                          <span
                            className={styles.userName}
                            title={user.username}
                          >
                            {user.username}
                          </span>
                          {user.uid ? (
                            <span className={styles.userUid}>
                              ID: {user.uid}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </td>
                    <td>
                      <RoleBadge role={user.role} />
                    </td>
                    <td>
                      <span className={styles.mutedText}>
                        {user.departmentName || '-'}
                      </span>
                    </td>
                    <td>
                      <span className={styles.phoneText}>
                        {user.phoneNumber || '-'}
                      </span>
                    </td>
                    <td>
                      <span className={styles.mutedText}>
                        {formatMinuteStamp(user.lastLogin)}
                      </span>
                    </td>
                    <td className={styles.actionCol}>
                      <Tooltip title="编辑用户">
                        <Button
                          type="text"
                          size="small"
                          aria-label={`编辑 ${user.username}`}
                          onClick={() => panel.openEdit(user)}
                        >
                          <SquarePen size={14} aria-hidden />
                        </Button>
                      </Tooltip>
                      <Tooltip
                        title={
                          panel.isDeleteDisabled(user)
                            ? '不能删除当前用户或超级管理员'
                            : '删除用户'
                        }
                      >
                        <Button
                          type="text"
                          size="small"
                          danger
                          disabled={panel.isDeleteDisabled(user)}
                          aria-label={`删除 ${user.username}`}
                          onClick={() => void panel.remove(user)}
                        >
                          <Trash2 size={14} aria-hidden />
                        </Button>
                      </Tooltip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {panel.total > panel.pageSize ? (
            <div className={styles.pagination}>
              <Pagination
                current={panel.page}
                pageSize={panel.pageSize}
                total={panel.total}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                showSizeChanger
                size="small"
                onChange={panel.changePage}
              />
            </div>
          ) : null}
        </>
      ) : (
        <div className={styles.empty}>
          <Empty
            description={
              panel.hasActiveFilters ? '没有匹配的用户' : '暂无用户数据'
            }
          />
        </div>
      )}

      <Modal
        open={panel.modalOpen}
        title={panel.editingUser ? '编辑用户' : '添加用户'}
        width={480}
        maskClosable={false}
        confirmLoading={panel.saving}
        onOk={() => void panel.submit()}
        onCancel={panel.closeModal}
      >
        <Form layout="vertical">
          <Form.Item
            label="用户名"
            htmlFor="user-username"
            required
            className={styles.formItem}
          >
            <Input
              id="user-username"
              placeholder="请输入用户名（2-20个字符）"
              maxLength={20}
              value={panel.values.username}
              onChange={(event) =>
                panel.changeValue({ username: event.target.value })
              }
              onBlur={() => void panel.checkUsername()}
            />
            {panel.usernameError ? (
              <div className={styles.errorText}>{panel.usernameError}</div>
            ) : null}
            {panel.generatedUid && !panel.editingUser ? (
              <div className={styles.helpText}>
                登录ID：{panel.generatedUid}
                ，此ID将用于登录，根据用户名自动生成
              </div>
            ) : null}
          </Form.Item>

          <Form.Item
            label="手机号"
            htmlFor="user-phone"
            className={styles.formItem}
          >
            <Input
              id="user-phone"
              placeholder="请输入手机号（可选，可用于登录）"
              maxLength={MAX_PHONE_LENGTH}
              value={panel.values.phoneNumber}
              onChange={(event) =>
                panel.changeValue({ phoneNumber: event.target.value })
              }
            />
          </Form.Item>

          {panel.editingUser ? (
            <div className={styles.passwordToggle}>
              <label className={styles.passwordToggleLabel}>
                <input
                  type="checkbox"
                  checked={panel.displayPasswordFields}
                  onChange={(event) =>
                    panel.setDisplayPasswordFields(event.target.checked)
                  }
                />
                修改密码
              </label>
            </div>
          ) : null}

          {!panel.editingUser || panel.displayPasswordFields ? (
            <>
              <Form.Item
                label="密码"
                htmlFor="user-password"
                required
                className={styles.formItem}
              >
                <Input.Password
                  id="user-password"
                  placeholder={`请输入密码（至少 ${MIN_PASSWORD_LENGTH} 位）`}
                  maxLength={MAX_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  value={panel.values.password}
                  onChange={(event) =>
                    panel.changeValue({ password: event.target.value })
                  }
                />
              </Form.Item>

              <Form.Item
                label="确认密码"
                htmlFor="user-confirm"
                required
                className={styles.formItem}
              >
                <Input.Password
                  id="user-confirm"
                  placeholder="请再次输入密码"
                  maxLength={MAX_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  value={panel.values.confirmPassword}
                  onChange={(event) =>
                    panel.changeValue({ confirmPassword: event.target.value })
                  }
                />
              </Form.Item>
            </>
          ) : null}

          {panel.editingUser ? null : (
            <Form.Item
              label="角色"
              htmlFor="user-role"
              className={styles.formItem}
            >
              <Select
                id="user-role"
                value={panel.values.role}
                onChange={(role) => panel.changeValue({ role })}
                options={[
                  { value: 'user', label: '普通用户' },
                  ...(panel.isSuperuser
                    ? [{ value: 'admin', label: '管理员' }]
                    : []),
                ]}
              />
            </Form.Item>
          )}

          {panel.isSuperuser ? (
            <Form.Item
              label="部门"
              htmlFor="user-department"
              className={styles.formItem}
            >
              <Select
                id="user-department"
                placeholder="请选择部门"
                allowClear
                value={panel.values.departmentId ?? undefined}
                onChange={(departmentId) =>
                  panel.changeValue({ departmentId: departmentId ?? null })
                }
                options={panel.departmentOptions.map((option) => ({
                  value: Number(option.value),
                  label: option.label,
                }))}
              />
            </Form.Item>
          ) : null}
        </Form>
      </Modal>
    </div>
  );
};

/** 28px 圆头像；有图用图，否则用首字母渐变（与账户设置同口径）。 */
const UserAvatar = ({ user }: { user: ManagedUser }) => {
  if (user.avatar) {
    return (
      <img
        className={styles.avatar}
        src={user.avatar}
        alt={user.username}
        width={28}
        height={28}
      />
    );
  }

  return (
    <span
      className={styles.avatar}
      style={{ background: avatarBackground(user.uid || user.username) }}
      aria-hidden
    >
      {avatarInitials(user.username)}
    </span>
  );
};

/** 角色徽章；超管走警告色、管理员走主色、普通用户走灰。 */
const RoleBadge = ({ role }: { role: string }) => {
  const className =
    role === 'superadmin'
      ? styles.roleSuperadmin
      : role === 'admin'
        ? styles.roleAdmin
        : '';

  return (
    <span className={`${styles.roleBadge} ${className}`}>
      {role === 'superadmin' ? (
        <UserLock size={12} aria-hidden />
      ) : role === 'admin' ? (
        <UserStar size={12} aria-hidden />
      ) : (
        <UserIcon size={12} aria-hidden />
      )}
      <span>{formatUserRole(role)}</span>
    </span>
  );
};
