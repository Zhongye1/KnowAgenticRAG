import { Button, Form, Input } from 'antd';
import { Lock, User } from 'lucide-react';

import { MIN_PASSWORD_LENGTH } from '@/entities/session';
import {
  AgreementConsent,
  type AgreementConsentProps,
} from '@/widgets/auth-shell';

import styles from './register-page.module.css';

export type RegisterFormValues = {
  uid: string;
  phone_number?: string;
  password: string;
  confirmPassword: string;
};

type RegisterFormProps = {
  loading: boolean;
  onSubmit: (values: RegisterFormValues) => void;
  showAgreement: boolean;
  agreement: AgreementConsentProps;
};

/**
 * 自助注册表单。
 *
 * 校验口径与首启初始化表单、后端 `RegisterRequest` 同源：UID 只允许字母数字下划线且 3–20 位，
 * 手机号可选但要符合大陆号段，密码长度取自 `MIN_PASSWORD_LENGTH`。
 */
export const RegisterForm = ({
  loading,
  onSubmit,
  showAgreement,
  agreement,
}: RegisterFormProps) => {
  return (
    <div className={styles.registerForm}>
      <Form<RegisterFormValues> layout="vertical" onFinish={onSubmit}>
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
          <Input
            prefix={<User size={18} />}
            placeholder="登录用，3-20个字符"
            autoComplete="username"
            maxLength={20}
          />
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
          <Input.Password
            prefix={<Lock size={18} />}
            placeholder={`至少 ${MIN_PASSWORD_LENGTH} 个字符`}
            autoComplete="new-password"
          />
        </Form.Item>

        <Form.Item
          label="确认密码"
          name="confirmPassword"
          dependencies={['password']}
          rules={[
            { required: true, message: '请再次输入密码' },
            ({ getFieldValue }) => ({
              validator: async (_rule, value: string) => {
                if (!value || getFieldValue('password') === value) return;
                throw new Error('两次输入的密码不一致');
              },
            }),
          ]}
        >
          <Input.Password
            prefix={<Lock size={18} />}
            placeholder="再次输入密码"
            autoComplete="new-password"
          />
        </Form.Item>

        {showAgreement ? (
          <Form.Item className={styles.agreementFormItem}>
            <AgreementConsent {...agreement} />
          </Form.Item>
        ) : null}

        <Form.Item>
          <Button
            htmlType="submit"
            variant="solid"
            color="primary"
            block
            loading={loading}
          >
            注册
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
};
