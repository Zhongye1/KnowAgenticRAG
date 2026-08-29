import { Auth_layout } from '@/components/layouts/auth_layout';
import { LoginCard } from '@/features/auth/components/login-card';

const AuthPageShell = () => {
  return (
    <Auth_layout title="登录">
      <LoginCard />
    </Auth_layout>
  );
};

export default AuthPageShell;
