import { Pen } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Form, Input, Textarea } from '@/components/ui/form';
import { useNotifications } from '@/components/ui/notifications';
import { useUser } from '@/lib/auth';

import {
  updateProfileInputSchema,
  useUpdateProfile,
} from '../api/update-profile';

export const UpdateProfile = () => {
  const [open, setOpen] = useState(false);
  const user = useUser();
  const { addNotification } = useNotifications();
  const updateProfileMutation = useUpdateProfile({
    mutationConfig: {
      onSuccess: () => {
        setOpen(false);
        addNotification({
          type: 'success',
          title: 'Profile Updated',
        });
      },
    },
  });

  return (
    <Drawer direction="right" open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button icon={<Pen className="size-4" />} size="sm">
          Update Profile
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Update Profile</DrawerTitle>
          <DrawerDescription className="sr-only">
            Update Profile
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-4">
          <Form
            id="update-profile"
            onSubmit={(values) => {
              updateProfileMutation.mutate({ data: values });
            }}
            options={{
              defaultValues: {
                firstName: user.data?.firstName ?? '',
                lastName: user.data?.lastName ?? '',
                email: user.data?.email ?? '',
                bio: user.data?.bio ?? '',
              },
            }}
            schema={updateProfileInputSchema}
          >
            {({ register, formState }) => (
              <>
                <Input
                  label="First Name"
                  error={formState.errors['firstName']}
                  registration={register('firstName')}
                />
                <Input
                  label="Last Name"
                  error={formState.errors['lastName']}
                  registration={register('lastName')}
                />
                <Input
                  label="Email Address"
                  type="email"
                  error={formState.errors['email']}
                  registration={register('email')}
                />

                <Textarea
                  label="Bio"
                  error={formState.errors['bio']}
                  registration={register('bio')}
                />
              </>
            )}
          </Form>
        </div>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button
              form="update-profile"
              type="submit"
              size="sm"
              isLoading={updateProfileMutation.isPending}
            >
              Submit
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};
