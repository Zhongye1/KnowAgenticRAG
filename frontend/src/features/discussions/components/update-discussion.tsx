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
import { Authorization, ROLES } from '@/lib/authorization';

import { useDiscussion } from '../api/get-discussion';
import {
  updateDiscussionInputSchema,
  useUpdateDiscussion,
} from '../api/update-discussion';

type UpdateDiscussionProps = {
  discussionId: string;
};

export const UpdateDiscussion = ({ discussionId }: UpdateDiscussionProps) => {
  const [open, setOpen] = useState(false);
  const { addNotification } = useNotifications();
  const discussionQuery = useDiscussion({ discussionId });
  const updateDiscussionMutation = useUpdateDiscussion({
    mutationConfig: {
      onSuccess: () => {
        setOpen(false);
        addNotification({
          type: 'success',
          title: 'Discussion Updated',
        });
      },
    },
  });

  const discussion = discussionQuery.data?.data;

  return (
    <Authorization allowedRoles={[ROLES.ADMIN]}>
      <Drawer direction="right" open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          <Button icon={<Pen className="size-4" />} size="sm">
            Update Discussion
          </Button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Update Discussion</DrawerTitle>
            <DrawerDescription className="sr-only">
              Update Discussion
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4">
            <Form
              id="update-discussion"
              onSubmit={(values) => {
                updateDiscussionMutation.mutate({
                  data: values,
                  discussionId,
                });
              }}
              options={{
                defaultValues: {
                  title: discussion?.title ?? '',
                  body: discussion?.body ?? '',
                },
              }}
              schema={updateDiscussionInputSchema}
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
                form="update-discussion"
                type="submit"
                size="sm"
                isLoading={updateDiscussionMutation.isPending}
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
