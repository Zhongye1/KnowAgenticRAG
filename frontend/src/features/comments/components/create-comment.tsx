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
import { Form, Textarea } from '@/components/ui/form';
import { useNotifications } from '@/components/ui/notifications';

import {
  useCreateComment,
  createCommentInputSchema,
} from '../api/create-comment';

type CreateCommentProps = {
  discussionId: string;
};

export const CreateComment = ({ discussionId }: CreateCommentProps) => {
  const [open, setOpen] = useState(false);
  const { addNotification } = useNotifications();
  const createCommentMutation = useCreateComment({
    discussionId,
    mutationConfig: {
      onSuccess: () => {
        setOpen(false);
        addNotification({
          type: 'success',
          title: 'Comment Created',
        });
      },
    },
  });

  return (
    <Drawer direction="right" open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button size="sm" icon={<Plus className="size-4" />}>
          Create Comment
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Create Comment</DrawerTitle>
          <DrawerDescription className="sr-only">
            Create Comment
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-4">
          <Form
            id="create-comment"
            onSubmit={(values) => {
              createCommentMutation.mutate({
                data: values,
              });
            }}
            schema={createCommentInputSchema}
            options={{
              defaultValues: {
                body: '',
                discussionId: discussionId,
              },
            }}
          >
            {({ register, formState }) => (
              <Textarea
                label="Body"
                error={formState.errors['body']}
                registration={register('body')}
              />
            )}
          </Form>
        </div>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button
              isLoading={createCommentMutation.isPending}
              form="create-comment"
              type="submit"
              size="sm"
              disabled={createCommentMutation.isPending}
            >
              Submit
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};
