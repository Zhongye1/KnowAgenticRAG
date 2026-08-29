import { useNavigate, useSearchParams } from 'react-router';

import { AuthLayout } from '@/components/layouts/auth-layout';
import { paths } from '@/config/paths';
import { RegisterForm } from '@/features/auth/components/register-form';

const RegisterRoute = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirectTo');

  return (
    <AuthLayout title="创建账号">
      <RegisterForm
        onSuccess={() =>
          navigate(paths.auth.login.getHref(redirectTo ?? undefined))
        }
      />
    </AuthLayout>
  );
};

export default RegisterRoute;
