import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { paths } from '@/config/paths';
import { NavBar } from '@/components/Navbar';
import { PageTransition } from '@/components/ui/page-transition';
import { Loginpagecontent } from '@/features/auth/components/login-page-content';
import { useUser } from '@/lib/auth';

const AuthPageShell = () => {
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
      <div className="overflow-hidden h-100vh "></div>
      <NavBar />
      <PageTransition>
        <Loginpagecontent />
      </PageTransition>
    </>
  );
};

export default AuthPageShell;
