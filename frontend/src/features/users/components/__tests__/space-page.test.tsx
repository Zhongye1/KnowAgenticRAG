import { mockEmailCaptcha } from '@/testing/mocks/handlers/users';
import {
  createUser,
  renderApp,
  screen,
  userEvent,
  waitFor,
} from '@/testing/test-utils';

import { SpacePage } from '../space-page';

/**
 * 个人空间的行为约定：
 * - 资料来自会话用户（`GET /sys/users/me`），写操作成功后资料卡必须同步刷新；
 * - 能在前端拦下的（两次密码不一致、邮箱格式）不往后端发请求；
 * - 换邮箱必须先发验证码，验证码不对就不该改库。
 *
 * 说明：跑测试时 `NODE_ENV` 需为 `test`——`NODE_ENV=production` 会让 React 解析到
 * 生产构建（没有 `React.act`），RTL 的 render 会直接抛错。
 */
test('展示当前账号资料与角色', async () => {
  const user = await createUser({
    nickname: '张三',
    email: 'zhangsan@example.com',
    dept: '平台组',
    roles: ['测试', '研发'],
    is_superuser: true,
  });

  await renderApp(<SpacePage />, { user });

  // 昵称同时出现在资料卡标题与字段里
  expect((await screen.findAllByText('张三')).length).toBeGreaterThan(1);
  expect(screen.getByText(`@${user.username}`)).toBeInTheDocument();
  expect(
    screen.getAllByText('zhangsan@example.com').length,
  ).toBeGreaterThan(0);
  expect(screen.getByText('平台组')).toBeInTheDocument();
  expect(screen.getByText('测试、研发')).toBeInTheDocument();
  expect(screen.getByText('超级管理员')).toBeInTheDocument();
});

test('修改昵称后资料卡同步刷新', async () => {
  const user = await createUser({ nickname: '旧昵称' });

  await renderApp(<SpacePage />, { user });

  await userEvent.click(
    await screen.findByRole('button', { name: /修改昵称/ }),
  );

  const input = await screen.findByLabelText('昵称');
  await userEvent.clear(input);
  await userEvent.type(input, '新昵称');
  await userEvent.click(screen.getByRole('button', { name: '保存' }));

  // 服务端改了 db 里的会话用户，refetch 后标题与字段都应是新值
  await waitFor(() => {
    expect(screen.getAllByText('新昵称').length).toBeGreaterThan(1);
  });
  expect(screen.queryByText('旧昵称')).not.toBeInTheDocument();
});

test('两次新密码不一致时前端拦下，不发请求', async () => {
  const user = await createUser();

  await renderApp(<SpacePage />, { user });

  await userEvent.click(
    await screen.findByRole('button', { name: /修改密码/ }),
  );

  await userEvent.type(await screen.findByLabelText('当前密码'), user.password);
  await userEvent.type(screen.getByLabelText('新密码'), 'newpass123');
  await userEvent.type(screen.getByLabelText('确认新密码'), 'newpass124');
  await userEvent.click(screen.getByRole('button', { name: '更新密码' }));

  expect(
    await screen.findByText('两次输入的新密码不一致'),
  ).toBeInTheDocument();
  // 对话框仍在原地等待修正，说明没有走到成功分支
  expect(screen.getByLabelText('新密码')).toBeInTheDocument();
});

test('换邮箱要先发验证码，验证码正确才落库', async () => {
  const user = await createUser({ email: 'old@example.com' });

  await renderApp(<SpacePage />, { user });

  await userEvent.click(
    await screen.findByRole('button', { name: /更换邮箱/ }),
  );

  const emailInput = await screen.findByLabelText('新邮箱');
  await userEvent.clear(emailInput);
  await userEvent.type(emailInput, 'new@example.com');
  await userEvent.click(screen.getByRole('button', { name: '发送验证码' }));

  // 发码后进入冷却，按钮变成倒计时
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /后重发/ })).toBeInTheDocument();
  });

  await userEvent.type(screen.getByLabelText('邮箱验证码'), mockEmailCaptcha);
  await userEvent.click(screen.getByRole('button', { name: '确认更换' }));

  await waitFor(() => {
    expect(screen.getAllByText('new@example.com').length).toBeGreaterThan(0);
  });
  expect(screen.queryByText('old@example.com')).not.toBeInTheDocument();
});
