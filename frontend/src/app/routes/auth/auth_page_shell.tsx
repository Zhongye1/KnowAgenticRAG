import { AuthLayout } from '@/components/layouts/auth-layout';
import { LoginCard } from '@/features/auth/components/login-card';

const AuthPageShell = () => {
  return (
    <AuthLayout title="登录">
      <LoginCard />
    </AuthLayout>
  );
};

export default AuthPageShell;
