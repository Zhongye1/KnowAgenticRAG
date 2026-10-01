import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { Button } from '@/shared/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { paths } from '@/shared/config';
import { useLogin } from '@/entities/session';

export const LoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirectTo');

  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');

  const login = useLogin({
    onSuccess: () => {
      navigate(redirectTo ?? paths.app.chat.getHref(), { replace: true });
    },
  });

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    login.mutate({ username, password });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-color-bg-2 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>登录 ARS</CardTitle>
          <CardDescription>使用 uid 或手机号登录。</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="username">
                账号
              </label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="password">
                密码
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {login.isError ? (
              <p className="text-sm text-color-danger-6" role="alert">
                {login.error instanceof Error
                  ? login.error.message
                  : '登录失败，请重试。'}
              </p>
            ) : null}
            <Button type="submit" disabled={login.isPending || !username || !password}>
              {login.isPending ? '登录中…' : '登录'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
