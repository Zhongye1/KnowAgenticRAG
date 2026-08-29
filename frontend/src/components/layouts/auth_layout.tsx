import * as React from 'react';
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { LoginHeader } from '@/features/auth/components/login-header';
import { paths } from '@/config/paths';
import { useUser } from '@/lib/auth';

type LayoutProps = {
  children: React.ReactNode;
  title: string;
};

export const Auth_layout = ({ children, title }: LayoutProps) => {
  const user = useUser();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirectTo');

  const navigate = useNavigate();

  useEffect(() => {
    if (user.data) {
      navigate(redirectTo ? redirectTo : paths.app.dashboard.getHref(), {
        replace: true,
      });
    }
  }, [user.data, navigate, redirectTo]);

  return (
    <>
      <LoginHeader></LoginHeader>
      <div className="flex min-h-screen flex-col justify-center bg-color-bg-1 py-12 sm:px-6 lg:px-8">
        <h2 className="mt-3 text-center text-3xl font-extrabold text-color-text-1">
          {title}
        </h2>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-color-bg-2 px-4 py-8 shadow-2-center sm:rounded-large sm:px-10">
            {children}
          </div>
        </div>
      </div>
    </>
  );
};
