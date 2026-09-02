import { PencilSimple } from '@phosphor-icons/react';
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

import { useUpdateKnowledgeBase } from '../api/knowledge-bases';
import type { KnowledgeBase } from '../api/types';
import { KnowledgeBaseFormFields } from './knowledge-base-form-fields';
import { isKnowledgeTheme } from './knowledge-theme';

type UpdateKnowledgeBaseProps = {
  kb: KnowledgeBase;
};

export function UpdateKnowledgeBase({ kb }: UpdateKnowledgeBaseProps) {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(kb.display_name);
  const [description, setDescription] = useState(kb.description);
  const [theme, setTheme] = useState<string>(
    isKnowledgeTheme(kb.theme) ? kb.theme : 'blue',
  );
  const { addNotification } = useNotifications();
  const updateMutation = useUpdateKnowledgeBase({
    mutationConfig: {
      onSuccess: (data) => {
        addNotification({
          type: 'success',
          title: '知识库已更新',
          message: data.display_name,
        });
        setOpen(false);
      },
    },
  });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setDisplayName(kb.display_name);
      setDescription(kb.description);
      setTheme(isKnowledgeTheme(kb.theme) ? kb.theme : 'blue');
    }
  };

  const handleSave = () => {
    const trimmedName = displayName.trim();
    if (!trimmedName) return;
    updateMutation.mutate({
      kb_name: kb.kb_name,
      data: {
        display_name: trimmedName,
        description: description.trim(),
        theme,
      },
    });
  };

  return (
    <Drawer direction="right" open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`编辑知识库 ${kb.display_name}`}
          title="编辑知识库"
        >
          <PencilSimple />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>编辑知识库</DrawerTitle>
          <DrawerDescription>
            更新知识库的名称、主题色与描述。
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-4 px-4 pb-4">
          <KnowledgeBaseFormFields
            displayName={displayName}
            onDisplayNameChange={setDisplayName}
            description={description}
            onDescriptionChange={setDescription}
            theme={theme}
            onThemeChange={setTheme}
            kbName={kb.kb_name}
          />
        </div>
        <DrawerFooter>
          <Button
            size="sm"
            disabled={updateMutation.isPending || !displayName.trim()}
            onClick={handleSave}
          >
            保存
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
