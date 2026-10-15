/** 部门管理分区。 */
import * as React from 'react';
import { Building2, Plus, RefreshCw, SquarePen, Trash2 } from 'lucide-react';

import { Button, Empty, Form, Input, Modal, Spin, Tooltip } from 'antd';

import { MIN_PASSWORD_LENGTH } from '@/entities/session';

import {
  MAX_ADMIN_UID_LENGTH,
  MAX_DEPARTMENT_DESCRIPTION_LENGTH,
  MAX_DEPARTMENT_NAME_LENGTH,
  MAX_PHONE_LENGTH,
} from '../lib/department-form';
import { useDepartmentManagement } from '../model/use-department-management';

import styles from './department-management-panel.module.css';

type DepartmentManagementPanelProps = {
  notifySuccess: (message: string) => void;
  notifyError: (message: string) => void;
};

export const DepartmentManagementPanel = ({
  notifySuccess,
  notifyError,
}: DepartmentManagementPanelProps) => {
  const panel = useDepartmentManagement({ notifySuccess, notifyError });

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>部门管理</div>
          <p className={styles.description}>
            管理系统部门，部门下的用户会被隔离管理。
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
            添加部门
          </Button>
        </div>
      </div>

      {panel.isLoading ? (
        <div className={styles.center}>
          <Spin />
        </div>
      ) : panel.departments.length ? (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.nameCol}>部门名称</th>
                <th className={styles.descCol}>描述</th>
                <th className={styles.countCol}>用户数量</th>
                <th className={styles.actionCol}>操作</th>
              </tr>
            </thead>
            <tbody>
              {panel.departments.map((department) => (
                <tr key={department.id}>
                  <td>
                    <span className={styles.nameCell}>
                      <Building2 size={15} aria-hidden />
                      <span title={department.name}>{department.name}</span>
                    </span>
                  </td>
                  <td>
                    <span className={styles.descText}>
                      {department.description || '-'}
                    </span>
                  </td>
                  <td>
                    <span className={styles.countBadge}>
                      {department.userCount} 人
                    </span>
                  </td>
                  <td className={styles.actionCol}>
                    <Tooltip title="编辑部门">
                      <Button
                        type="text"
                        size="small"
                        aria-label={`编辑 ${department.name}`}
                        onClick={() => panel.openEdit(department)}
                      >
                        <SquarePen size={14} aria-hidden />
                      </Button>
                    </Tooltip>
                    <Tooltip title="删除部门">
                      <Button
                        type="text"
                        size="small"
                        danger
                        disabled={department.id === 1}
                        aria-label={`删除 ${department.name}`}
                        onClick={() => void panel.remove(department)}
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
      ) : (
        <div className={styles.empty}>
          <Empty description="暂无部门数据" />
        </div>
      )}

      <Modal
        open={panel.modalOpen}
        title={panel.editing ? '编辑部门' : '添加部门'}
        width={520}
        maskClosable={false}
        confirmLoading={panel.saving}
        onOk={() => void panel.submit()}
        onCancel={panel.closeModal}
      >
        <Form layout="vertical" autoComplete="off">
          <Form.Item
            label="部门名称"
            htmlFor="department-name"
            required
            className={styles.formItem}
          >
            <Input
              id="department-name"
              size="large"
              placeholder="请输入部门名称"
              maxLength={MAX_DEPARTMENT_NAME_LENGTH}
              value={panel.values.name}
              onChange={(event) =>
                panel.changeValue({ name: event.target.value })
              }
            />
          </Form.Item>

          <Form.Item
            label="部门描述"
            htmlFor="department-description"
            className={styles.formItem}
          >
            <Input.TextArea
              id="department-description"
              rows={3}
              placeholder="请输入部门描述（可选）"
              maxLength={MAX_DEPARTMENT_DESCRIPTION_LENGTH}
              showCount
              value={panel.values.description}
              onChange={(event) =>
                panel.changeValue({ description: event.target.value })
              }
            />
          </Form.Item>

          {panel.editing ? null : (
            <>
              <div className={styles.adminDivider} />

              <p className={styles.adminHint}>
                创建部门时必须同时创建管理员，该管理员将负责管理本部门用户
              </p>

              <Form.Item
                label="管理员UID"
                htmlFor="department-admin-uid"
                required
                className={styles.formItem}
              >
                <Input
                  id="department-admin-uid"
                  size="large"
                  placeholder="请输入管理员UID（3-20位字母/数字/下划线）"
                  maxLength={MAX_ADMIN_UID_LENGTH}
                  autoComplete="off"
                  value={panel.values.adminUid}
                  onChange={(event) =>
                    panel.changeValue({ adminUid: event.target.value })
                  }
                  onBlur={() => void panel.checkUid()}
                />
                {panel.uidError ? (
                  <div className={styles.errorText}>{panel.uidError}</div>
                ) : (
                  <div className={styles.helpText}>此 UID 将用于登录</div>
                )}
              </Form.Item>

              <Form.Item
                label="密码"
                htmlFor="department-admin-password"
                required
                className={styles.formItem}
              >
                <Input.Password
                  id="department-admin-password"
                  size="large"
                  placeholder={`请输入管理员密码（至少 ${MIN_PASSWORD_LENGTH} 位）`}
                  maxLength={50}
                  autoComplete="new-password"
                  value={panel.values.adminPassword}
                  onChange={(event) =>
                    panel.changeValue({ adminPassword: event.target.value })
                  }
                />
              </Form.Item>

              <Form.Item
                label="确认密码"
                htmlFor="department-admin-confirm"
                required
                className={styles.formItem}
              >
                <Input.Password
                  id="department-admin-confirm"
                  size="large"
                  placeholder="请再次输入密码"
                  maxLength={50}
                  autoComplete="new-password"
                  value={panel.values.adminConfirmPassword}
                  onChange={(event) =>
                    panel.changeValue({
                      adminConfirmPassword: event.target.value,
                    })
                  }
                />
              </Form.Item>

              <Form.Item
                label="手机号（可选）"
                htmlFor="department-admin-phone"
                className={styles.formItem}
              >
                <Input
                  id="department-admin-phone"
                  size="large"
                  placeholder="请输入手机号（可用于登录）"
                  maxLength={MAX_PHONE_LENGTH}
                  autoComplete="off"
                  value={panel.values.adminPhone}
                  onChange={(event) =>
                    panel.changeValue({ adminPhone: event.target.value })
                  }
                />
                {panel.phoneError ? (
                  <div className={styles.errorText}>{panel.phoneError}</div>
                ) : null}
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
};
