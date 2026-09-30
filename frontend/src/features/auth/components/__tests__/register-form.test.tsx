import { createUser } from '@/testing/data-generators';
import { renderApp, screen, userEvent, waitFor } from '@/testing/test-utils';

import { RegisterForm } from '../register-form';

test('should register new user and call onSuccess cb which should navigate the user to login', async () => {
  // 注册表单不收集昵称（后端 register 的 nickname 可选，缺省由用户名兜底）；
  // 密码显式给足 6 位，免得依赖 falso 的随机长度
  const newUser = createUser({ password: 'Passw0rd123' });

  const onSuccess = vi.fn();

  await renderApp(<RegisterForm onSuccess={onSuccess} />, { user: null });

  await userEvent.type(screen.getByLabelText(/用户名/i), newUser.username);
  await userEvent.type(screen.getByLabelText(/邮箱/i), newUser.email);
  await userEvent.type(screen.getByLabelText('密码'), newUser.password);
  await userEvent.type(screen.getByLabelText('确认密码'), newUser.password);

  await userEvent.click(screen.getByRole('button', { name: /注册/i }));

  await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
});
