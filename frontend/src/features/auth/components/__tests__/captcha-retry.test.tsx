import { HttpResponse, http } from 'msw';

import { env } from '@/config/env';
import { server } from '@/testing/mocks/server';
import { renderApp, screen, userEvent, waitFor } from '@/testing/test-utils';

import { RegisterForm } from '../register-form';

const CAPTCHA_URL = `${env.API_URL}/api/v1/auth/captcha`;

const okCaptcha = () =>
  HttpResponse.json({
    data: {
      is_enabled: true,
      expire_seconds: 60,
      uuid: 'test-captcha-uuid',
      image: 'aGk=',
    },
  });

test('验证码加载失败时给出重试入口，点击重试后恢复', async () => {
  // 首次请求 + react-query 的自动重试都会失败，之后放行
  let failuresLeft = 2;
  server.use(
    http.get(CAPTCHA_URL, () =>
      failuresLeft-- > 0
        ? new HttpResponse(null, { status: 500 })
        : okCaptcha(),
    ),
  );

  await renderApp(<RegisterForm />, { user: null });

  // 失败后不能只是「整块消失」，必须留下可点击的重试入口
  const retry = await screen.findByRole(
    'button',
    { name: '验证码加载失败，点击重试' },
    { timeout: 3000 },
  );

  await userEvent.click(retry);

  await waitFor(() => {
    expect(screen.getByLabelText('验证码')).toBeInTheDocument();
  });
  expect(screen.getByAltText('验证码')).toBeInTheDocument();
});
