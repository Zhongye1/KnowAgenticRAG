import { Button } from '@/components/ui/button';
import { Form, Input } from '@/components/ui/form';
import { useLogin, loginInputSchema } from '@/lib/auth';

import { useCaptcha } from '../hooks/use-captcha';
import { CaptchaImage } from './captcha-image';

type LoginFormProps = {
  onSuccess: () => void;
};

export const LoginForm = ({ onSuccess }: LoginFormProps) => {
  const captcha = useCaptcha();

  const login = useLogin({
    onSuccess,
    // 验证码是一次性的：登录失败后必须换一张，否则重试必然继续失败
    onError: () => {
      if (captcha.isVisible) captcha.refresh();
    },
  });

  return (
    <div>
      <Form
        onSubmit={(values) => {
          login.mutate({
            ...values,
            uuid: captcha.isEnabled ? captcha.uuid : undefined,
            captcha: captcha.isEnabled ? captcha.code : undefined,
          });
        }}
        schema={loginInputSchema}
      >
        {({ register, formState }) => (
          <>
            <Input
              type="text"
              label="用户名"
              error={formState.errors['username']}
              registration={register('username')}
            />
            <Input
              type="password"
              label="密码"
              error={formState.errors['password']}
              registration={register('password')}
            />
            {captcha.isVisible && (
              <div className="flex items-end gap-2">
                <Input
                  type="text"
                  label="验证码"
                  value={captcha.code}
                  onChange={(e) => captcha.setCode(e.target.value)}
                  registration={{}}
                  className="flex-1"
                />
                <CaptchaImage
                  className="mb-1"
                  imageSrc={captcha.imageSrc}
                  isLoading={captcha.isLoading}
                  isFailed={captcha.isFailed}
                  onRefresh={captcha.refresh}
                  onImageError={captcha.onImageError}
                />
              </div>
            )}
            <div>
              <Button
                isLoading={login.isPending}
                type="submit"
                className="w-full"
              >
                登录
              </Button>
            </div>
          </>
        )}
      </Form>
    </div>
  );
};
