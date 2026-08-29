import {
  createUser,
  renderApp,
  screen,
  userEvent,
  waitFor,
} from '@/testing/test-utils';

import { LoginForm } from '../login-form';

test('should login new user and call onSuccess cb which should navigate the user to the app', async () => {
  const newUser = await createUser({ teamId: undefined });

  const onSuccess = vi.fn();

  await renderApp(<LoginForm onSuccess={onSuccess} />, { user: null });

  await userEvent.type(screen.getByLabelText(/用户名/i), newUser.username);
  await userEvent.type(screen.getByLabelText(/密码/i), newUser.password);

  await userEvent.click(screen.getByRole('button', { name: /登录/i }));

  await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
});
