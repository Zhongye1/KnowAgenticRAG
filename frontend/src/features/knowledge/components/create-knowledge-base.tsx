import { Plus } from '@phosphor-icons/react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { useNotifications } from '@/components/ui/notifications';

import { useCreateKnowledgeBase } from '../api/knowledge-bases';
import { KnowledgeBaseFormFields } from './knowledge-base-form-fields';

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export function CreateKnowledgeBase() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [theme, setTheme] = useState('blue');
  const { addNotification } = useNotifications();
  const createMutation = useCreateKnowledgeBase({
    mutationConfig: {
      onSuccess: (data) => {
        addNotification({
          type: 'success',
          title: '知识库创建成功',
          message: data.display_name,
        });
        setOpen(false);
        setName('');
        setDescription('');
        setTheme('blue');
      },
    },
  });

  const kbName = slugify(name);

  const handleSubmit = () => {
    if (!name.trim() || !kbName) return;
    createMutation.mutate({
      kb_name: kbName,
      display_name: name.trim(),
      description: description.trim(),
      theme,
      icon: 'database',
    });
  };

  return (
    <Drawer direction="right" open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          新建知识库
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>新建知识库</DrawerTitle>
          <DrawerDescription>
            创建一个知识库来整理和管理知识内容。
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-4 px-4 pb-4">
          <KnowledgeBaseFormFields
            displayName={name}
            onDisplayNameChange={setName}
            description={description}
            onDescriptionChange={setDescription}
            theme={theme}
            onThemeChange={setTheme}
            kbNamePreview={kbName}
          />
        </div>
        <DrawerFooter>
          <Button
            size="sm"
            disabled={createMutation.isPending || !name.trim() || !kbName}
            onClick={handleSubmit}
          >
            创建
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
