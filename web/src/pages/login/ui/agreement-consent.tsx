import { Checkbox } from 'antd';

import styles from './login-page.module.css';

export type AgreementConsentProps = {
  accepted: boolean;
  onChange: (accepted: boolean) => void;
  userAgreementUrl: string;
  privacyPolicyUrl: string;
};

/**
 * 协议勾选。是否渲染由调用方按「两个协议地址都配置」决定，这里不重复判断。
 */
export const AgreementConsent = ({
  accepted,
  onChange,
  userAgreementUrl,
  privacyPolicyUrl,
}: AgreementConsentProps) => {
  return (
    <div className={styles.agreementRow}>
      <Checkbox
        checked={accepted}
        onChange={(event) => onChange(event.target.checked)}
      >
        登录即代表同意
        <a
          className={styles.agreementLink}
          href={userAgreementUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
        >
          《用户协议》
        </a>
        <a
          className={styles.agreementLink}
          href={privacyPolicyUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
        >
          《隐私协议》
        </a>
      </Checkbox>
    </div>
  );
};
