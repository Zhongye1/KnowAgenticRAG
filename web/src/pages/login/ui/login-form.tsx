import { Button, Form, Input } from 'antd';
import { Lock, User } from 'lucide-react';

import {
  AgreementConsent,
  type AgreementConsentProps,
} from '@/widgets/auth-shell';

import { OidcLogin, type OidcLoginProps } from './oidc-login';
import styles from './login-page.module.css';

export type LoginFormValues = {
  /** 后端把 uid 与手机号统一收在 OAuth2 的 `username` 字段里。 */
  loginId: string;
  password: string;
};

type LoginFormProps = {
  loading: boolean;
  locked: boolean;
  lockedLabel: string;
  onSubmit: (values: LoginFormValues) => void;
  showAgreement: boolean;
  agreement: AgreementConsentProps;
  oidc: OidcLoginProps;
};

/** 登录表单：账号、密码、协议门禁、提交按钮与第三方登录入口。 */
export const LoginForm = ({
  loading,
  locked,
  lockedLabel,
  onSubmit,
  showAgreement,
  agreement,
  oidc,
}: LoginFormProps) => {
  return (
    <div className={styles.loginForm}>
      <Form<LoginFormValues> layout="vertical" onFinish={onSubmit}>
        <Form.Item
          label="登录账号"
          name="loginId"
          rules={[{ required: true, message: '请输入UID或手机号' }]}
        >
          <Input
            prefix={<User size={18} />}
            placeholder="UID或手机号"
            autoComplete="username"
          />
        </Form.Item>

        <Form.Item
          label="密码"
          name="password"
          rules={[{ required: true, message: '请输入密码' }]}
        >
          <Input.Password
            prefix={<Lock size={18} />}
            autoComplete="current-password"
          />
        </Form.Item>

        {showAgreement ? (
          <Form.Item className={styles.agreementFormItem}>
            <AgreementConsent {...agreement} />
          </Form.Item>
        ) : null}

        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            disabled={locked}
            block
            size="large"
          >
            {locked ? lockedLabel : '登录'}
          </Button>
        </Form.Item>
      </Form>

      <OidcLogin {...oidc} />
    </div>
  );
};
