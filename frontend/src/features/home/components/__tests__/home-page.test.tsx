import { paths } from '@/config/paths';
import { createUser, renderApp, screen } from '@/testing/test-utils';

import { HomePage } from '../home-page';

/**
 * 落地页的 CTA 都是 `<Link>`（走前端路由），不是 `<button>`——断言 role 用 link，
 * 并且顺带校验去向，避免只测到文案、测不到跳错地方。
 */
test('renders hero and login CTA for guests', async () => {
  await renderApp(<HomePage />, { user: null });

  expect(
    screen.getByRole('heading', { name: /让知识被智能体/ }),
  ).toBeInTheDocument();

  const loginHref = paths.auth.login.getHref(paths.app.root.path);
  // Hero 的「在线演示」与页尾 CTA 的「登录 / 注册」在游客态都指向登录页
  expect(screen.getByRole('link', { name: '在线演示' })).toHaveAttribute(
    'href',
    loginHref,
  );
  expect(screen.getByRole('link', { name: '登录 / 注册' })).toHaveAttribute(
    'href',
    loginHref,
  );
});

test('shows workspace CTA for authenticated users', async () => {
  const user = await createUser();
  await renderApp(<HomePage />, { user });

  // 已登录：两个 CTA 都改指工作台
  const ctas = await screen.findAllByRole('link', { name: '进入工作台' });
  expect(ctas.length).toBeGreaterThan(0);
  expect(ctas[0]).toHaveAttribute('href', paths.app.dashboard.getHref());
  expect(screen.getByRole('link', { name: '在线演示' })).toHaveAttribute(
    'href',
    paths.app.dashboard.getHref(),
  );
});
