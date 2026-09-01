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
import { Input, Label, Textarea } from '@/components/ui/form';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { useNotifications } from '@/components/ui/notifications';

import { useCreateKnowledgeBase } from '../api/knowledge-bases';

const KNOWLEDGE_BASE_TYPES = ['通用', '文档', '代码', '多媒体'] as const;

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export function CreateKnowledgeBase() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<string>(KNOWLEDGE_BASE_TYPES[0]);
  const [description, setDescription] = useState('');
  const { addNotification } = useNotifications();
  const createMutation = useCreateKnowledgeBase({
    mutationConfig: {
      onSuccess: (data) => {
        addNotification({
          type: 'success',
          title: '知识库创建成功',
          message: data.data.display_name,
        });
        setOpen(false);
        setName('');
        setDescription('');
      },
    },
  });

  const kbName = slugify(name);

  const handleSubmit = () => {
    createMutation.mutate({
      kb_name: kbName,
      display_name: name.trim(),
      description,
      theme: 'blue',
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
          <Input
            label="名称"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：产品文档"
          />
          {kbName && (
            <p className="text-xs text-color-text-2">
              知识库标识：<span className="font-mono">{kbName}</span>
            </p>
          )}
          <div className="flex flex-col gap-1">
            <Label>类型</Label>
            <NativeSelect
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="w-full"
            >
              {KNOWLEDGE_BASE_TYPES.map((option) => (
                <NativeSelectOption key={option} value={option}>
                  {option}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <Textarea
            label="描述"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="简单描述这个知识库的用途（可选）"
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
