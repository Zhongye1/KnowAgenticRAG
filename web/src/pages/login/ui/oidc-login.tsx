import { Button, Skeleton } from 'antd';
import { Key } from 'lucide-react';

import styles from './login-page.module.css';

export type OidcLoginProps = {
  /** 配置探测中：显示骨架屏而不是按钮。 */
  checking: boolean;
  /** 后端声明 OIDC 已启用。 */
  enabled: boolean;
  loading: boolean;
  buttonText: string;
  onLogin: () => void;
};

/** 第三方登录区：探测中显示骨架，探测到启用才渲染按钮，两者都不成立时整块不渲染。 */
export const OidcLogin = ({
  checking,
  enabled,
  loading,
  buttonText,
  onLogin,
}: OidcLoginProps) => {
  if (!checking && !enabled) return null;

  return (
    <div className={styles.thirdPartyLogin}>
      <div className={styles.divider}>
        <span>或使用以下方式登录</span>
      </div>
      <div className={styles.loginIcons}>
        {checking ? (
          <div className={styles.loginSkeleton}>
            <Skeleton.Button active block size="large" />
          </div>
        ) : (
          <Button
            type="default"
            size="large"
            block
            loading={loading}
            icon={<Key size={18} />}
            onClick={onLogin}
          >
            {buttonText}
          </Button>
        )}
      </div>
    </div>
  );
};
