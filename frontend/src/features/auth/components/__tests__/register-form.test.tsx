import { createUser } from '@/testing/data-generators';
import { renderApp, screen, userEvent, waitFor } from '@/testing/test-utils';

import { RegisterForm } from '../register-form';

test('should register new user and call onSuccess cb which should navigate the user to login', async () => {
  const newUser = createUser({});

  const onSuccess = vi.fn();

  await renderApp(<RegisterForm onSuccess={onSuccess} />, { user: null });

  await userEvent.type(screen.getByLabelText(/用户名/i), newUser.username);
  await userEvent.type(screen.getByLabelText(/昵称/i), newUser.nickname);
  await userEvent.type(screen.getByLabelText(/邮箱/i), newUser.email);
  await userEvent.type(screen.getByLabelText(/密码/i), newUser.password);

  await userEvent.click(screen.getByRole('button', { name: /注册/i }));

  await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
});
