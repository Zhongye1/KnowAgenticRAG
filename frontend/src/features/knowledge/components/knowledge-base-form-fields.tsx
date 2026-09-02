import { Input, Label, Textarea } from '@/components/ui/form';
import { cn } from '@/lib/utils';

import {
  getKnowledgeThemeAccent,
  KNOWLEDGE_THEME_OPTIONS,
} from './knowledge-theme';

type KnowledgeBaseFormFieldsProps = {
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  theme: string;
  onThemeChange: (value: string) => void;
  /** 已存在的知识库标识（编辑时展示，不可修改） */
  kbName?: string;
  /** 新建时的标识实时预览 */
  kbNamePreview?: string;
};

export function KnowledgeBaseFormFields({
  displayName,
  onDisplayNameChange,
  description,
  onDescriptionChange,
  theme,
  onThemeChange,
  kbName,
  kbNamePreview,
}: KnowledgeBaseFormFieldsProps) {
  return (
    <>
      <Input
        label="名称"
        value={displayName}
        onChange={(event) => onDisplayNameChange(event.target.value)}
        placeholder="例如：产品文档"
      />
      {kbName ? (
        <p className="text-xs text-muted-foreground">
          知识库标识：<span className="font-mono">{kbName}</span>
        </p>
      ) : kbNamePreview ? (
        <p className="text-xs text-muted-foreground">
          知识库标识：<span className="font-mono">{kbNamePreview}</span>
        </p>
      ) : (
        <p className="text-xs" aria-hidden="true">
          &nbsp;
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label>主题色</Label>
        <div className="flex items-center gap-2 pt-2">
          {KNOWLEDGE_THEME_OPTIONS.map((option) => {
            const accent = getKnowledgeThemeAccent(option.value);
            const active = theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                aria-label={option.label}
                title={option.label}
                onClick={() => onThemeChange(option.value)}
                className={cn(
                  'size-4 cursor-pointer rounded-full transition-all',
                  accent.swatch,
                  active
                    ? cn(
                        'scale-110 ring-2 ring-offset-2 ring-offset-background',
                        accent.ring,
                      )
                    : 'opacity-50 hover:opacity-100',
                )}
              />
            );
          })}
        </div>
      </div>
      <Textarea
        label="描述"
        value={description}
        onChange={(event) => onDescriptionChange(event.target.value)}
        placeholder="简单描述这个知识库的用途（可选）"
      />
    </>
  );
}
