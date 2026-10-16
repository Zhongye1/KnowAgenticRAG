import { Button, Form, Input } from 'antd';
import { Lock } from 'lucide-react';

import { MIN_PASSWORD_LENGTH } from '@/entities/session';
import {
  AgreementConsent,
  type AgreementConsentProps,
} from '@/widgets/auth-shell';

import styles from './login-page.module.css';

export type InitializeAdminFormValues = {
  uid: string;
  phone_number?: string;
  password: string;
  confirmPassword: string;
};

type InitializeAdminFormProps = {
  loading: boolean;
  onSubmit: (values: InitializeAdminFormValues) => void;
  showAgreement: boolean;
  agreement: AgreementConsentProps;
};

/**
 * 干净库首次运行时的超管初始化表单。
 *
 * 校验规则与后端 `InitializeAdmin` 同口径：UID 只允许字母数字下划线且 3–20 位，
 * 手机号可选但要符合大陆号段，密码长度取自 `MIN_PASSWORD_LENGTH`。
 */
export const InitializeAdminForm = ({
  loading,
  onSubmit,
  showAgreement,
  agreement,
}: InitializeAdminFormProps) => {
  return (
    <div className={`${styles.loginForm} ${styles.loginFormInit}`}>
      <Form<InitializeAdminFormValues> layout="vertical" onFinish={onSubmit}>
        <Form.Item
          label="UID"
          name="uid"
          rules={[
            { required: true, message: '请输入UID' },
            {
              pattern: /^[a-zA-Z0-9_]+$/,
              message: 'UID只能包含字母、数字和下划线',
            },
            { min: 3, max: 20, message: 'UID长度必须在3-20个字符之间' },
          ]}
        >
          <Input placeholder="请输入UID（3-20个字符）" maxLength={20} />
        </Form.Item>

        <Form.Item
          label="手机号（可选）"
          name="phone_number"
          rules={[
            {
              validator: async (_rule, value: string) => {
                if (!value || value.trim() === '') return;
                if (!/^1[3-9]\d{9}$/.test(value)) {
                  throw new Error('请输入正确的手机号格式');
                }
              },
            },
          ]}
        >
          <Input placeholder="可用于登录，可不填写" maxLength={11} />
        </Form.Item>

        <Form.Item
          label="密码"
          name="password"
          rules={[
            { required: true, message: '请输入密码' },
            {
              min: MIN_PASSWORD_LENGTH,
              message: `密码至少需要 ${MIN_PASSWORD_LENGTH} 个字符`,
            },
          ]}
        >
          <Input.Password prefix={<Lock size={18} />} />
        </Form.Item>

        <Form.Item
          label="确认密码"
          name="confirmPassword"
          dependencies={['password']}
          rules={[
            { required: true, message: '请确认密码' },
            ({ getFieldValue }) => ({
              validator: async (_rule, value: string) => {
                if (value && value !== getFieldValue('password')) {
                  throw new Error('两次输入的密码不一致');
                }
              },
            }),
          ]}
        >
          <Input.Password prefix={<Lock size={18} />} />
        </Form.Item>

        {showAgreement ? (
          <Form.Item className={styles.agreementFormItem}>
            <AgreementConsent {...agreement} />
          </Form.Item>
        ) : null}

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            创建管理员账户
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
};
