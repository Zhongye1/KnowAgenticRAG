import { createUser, renderApp, screen } from '@/testing/test-utils';

import { HomePage } from '../home-page';

test('renders hero and login CTA for guests', async () => {
  await renderApp(<HomePage />, { user: null });

  expect(
    screen.getByRole('heading', { name: /让知识被智能体/ }),
  ).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: '登录 / 注册' })).toHaveLength(2);
});

test('shows workspace CTA for authenticated users', async () => {
  const user = await createUser();
  await renderApp(<HomePage />, { user });

  expect(
    await screen.findAllByRole('button', { name: '进入工作台' }),
  ).not.toHaveLength(0);
});
