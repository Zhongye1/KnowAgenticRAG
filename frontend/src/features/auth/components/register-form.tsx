import { Button } from '@/components/ui/button';
import { Form, Input } from '@/components/ui/form';
import { useNotifications } from '@/components/ui/notifications';
import { registerInputSchema, useRegister } from '@/lib/auth';

type RegisterFormProps = {
  onSuccess: () => void;
};

export const RegisterForm = ({ onSuccess }: RegisterFormProps) => {
  const registering = useRegister({
    onSuccess: () => {
      useNotifications.getState().addNotification({
        type: 'success',
        title: '注册成功',
        message: '请使用新账号登录',
      });
      onSuccess();
    },
  });

  return (
    <div>
      <Form
        onSubmit={(values) => {
          registering.mutate(values);
        }}
        schema={registerInputSchema}
      >
        {({ register, formState }) => (
          <>
            <Input
              type="text"
              label="用户名"
              error={formState.errors['username']}
              registration={register('username')}
            />
            <Input
              type="text"
              label="昵称"
              error={formState.errors['nickname']}
              registration={register('nickname')}
            />
            <Input
              type="email"
              label="邮箱"
              error={formState.errors['email']}
              registration={register('email')}
            />
            <Input
              type="password"
              label="密码"
              error={formState.errors['password']}
              registration={register('password')}
            />
            <div>
              <Button
                isLoading={registering.isPending}
                type="submit"
                className="w-full"
              >
                注册
              </Button>
            </div>
          </>
        )}
      </Form>
    </div>
  );
};
