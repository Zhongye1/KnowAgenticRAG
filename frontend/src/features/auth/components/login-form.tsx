import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Form, Input } from '@/components/ui/form';
import { getCaptcha } from '@/generated/auth/get-captcha';
import type { GetCaptchaDetail } from '@/generated/types';
import { useLogin, loginInputSchema } from '@/lib/auth';

type LoginFormProps = {
  onSuccess: () => void;
};

export const LoginForm = ({ onSuccess }: LoginFormProps) => {
  const login = useLogin({ onSuccess });
  const [captcha, setCaptcha] = useState<GetCaptchaDetail | null>(null);
  const [captchaCode, setCaptchaCode] = useState('');

  const loadCaptcha = async () => {
    try {
      setCaptcha(await getCaptcha());
    } catch {
      setCaptcha(null);
    }
  };

  useEffect(() => {
    loadCaptcha();
  }, []);

  const captchaEnabled = Boolean(captcha?.is_enabled);

  return (
    <div>
      <Form
        onSubmit={(values) => {
          login.mutate({
            ...values,
            uuid: captchaEnabled ? captcha?.uuid : undefined,
            captcha: captchaEnabled ? captchaCode : undefined,
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
            {captchaEnabled && (
              <div className="flex items-end gap-2">
                <Input
                  type="text"
                  label="验证码"
                  value={captchaCode}
                  onChange={(e) => setCaptchaCode(e.target.value)}
                  registration={{}}
                  className="flex-1"
                />
                {captcha?.image ? (
                  <button
                    type="button"
                    onClick={loadCaptcha}
                    className="mb-1 h-9 shrink-0 cursor-pointer overflow-hidden rounded-md border"
                    aria-label="刷新验证码"
                  >
                    <img
                      src={captcha.image}
                      alt="验证码"
                      className="h-full w-24 object-cover"
                    />
                  </button>
                ) : null}
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
