import { Plus } from 'lucide-react';
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
import { Authorization, ROLES } from '@/lib/authorization';

import {
  createDiscussionInputSchema,
  useCreateDiscussion,
} from '../api/create-discussion';

export const CreateDiscussion = () => {
  const [open, setOpen] = useState(false);
  const { addNotification } = useNotifications();
  const createDiscussionMutation = useCreateDiscussion({
    mutationConfig: {
      onSuccess: () => {
        setOpen(false);
        addNotification({
          type: 'success',
          title: 'Discussion Created',
        });
      },
    },
  });

  return (
    <Authorization allowedRoles={[ROLES.ADMIN]}>
      <Drawer direction="right" open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          <Button size="sm" icon={<Plus className="size-4" />}>
            Create Discussion
          </Button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Create Discussion</DrawerTitle>
            <DrawerDescription className="sr-only">
              Create Discussion
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4">
            <Form
              id="create-discussion"
              onSubmit={(values) => {
                createDiscussionMutation.mutate({ data: values });
              }}
              schema={createDiscussionInputSchema}
            >
              {({ register, formState }) => (
                <>
                  <Input
                    label="Title"
                    error={formState.errors['title']}
                    registration={register('title')}
                  />

                  <Textarea
                    label="Body"
                    error={formState.errors['body']}
                    registration={register('body')}
                  />
                </>
              )}
            </Form>
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button
                form="create-discussion"
                type="submit"
                size="sm"
                isLoading={createDiscussionMutation.isPending}
              >
                Submit
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </Authorization>
  );
};
