import {
  BookOpen,
  Code,
  Cube,
  Database,
  Files,
  Images,
  Notebook,
  TextT,
  type Icon,
} from '@phosphor-icons/react';

export type KnowledgeThemeKey = 'blue' | 'green' | 'orange' | 'purple' | 'red';

type KnowledgeThemeAccent = {
  iconBg: string;
  iconText: string;
  swatch: string;
  ring: string;
};

const KNOWLEDGE_THEME_ACCENTS: Record<KnowledgeThemeKey, KnowledgeThemeAccent> =
  {
    blue: {
      iconBg: 'bg-primary-6/10',
      iconText: 'text-primary-6',
      swatch: 'bg-primary-6',
      ring: 'ring-primary-6/60',
    },
    green: {
      iconBg: 'bg-success-6/10',
      iconText: 'text-success-6',
      swatch: 'bg-success-6',
      ring: 'ring-success-6/60',
    },
    orange: {
      iconBg: 'bg-warning-6/10',
      iconText: 'text-warning-6',
      swatch: 'bg-warning-6',
      ring: 'ring-warning-6/60',
    },
    purple: {
      iconBg: 'bg-data-9/10',
      iconText: 'text-data-9',
      swatch: 'bg-data-9',
      ring: 'ring-data-9/60',
    },
    red: {
      iconBg: 'bg-danger-6/10',
      iconText: 'text-danger-6',
      swatch: 'bg-danger-6',
      ring: 'ring-danger-6/60',
    },
  };

export const KNOWLEDGE_THEME_OPTIONS: ReadonlyArray<{
  value: KnowledgeThemeKey;
  label: string;
}> = [
  { value: 'blue', label: '蓝色' },
  { value: 'green', label: '绿色' },
  { value: 'orange', label: '橙色' },
  { value: 'purple', label: '紫色' },
  { value: 'red', label: '红色' },
];

export const getKnowledgeThemeAccent = (
  theme: string | null | undefined,
): KnowledgeThemeAccent => {
  const key = theme as KnowledgeThemeKey | undefined;
  return key
    ? (KNOWLEDGE_THEME_ACCENTS[key] ?? KNOWLEDGE_THEME_ACCENTS.blue)
    : KNOWLEDGE_THEME_ACCENTS.blue;
};

export const isKnowledgeTheme = (
  value: string | null | undefined,
): value is KnowledgeThemeKey =>
  Boolean(value && value in KNOWLEDGE_THEME_ACCENTS);

const KNOWLEDGE_ICONS: Record<string, Icon> = {
  database: Database,
  book: BookOpen,
  code: Code,
  cube: Cube,
  files: Files,
  images: Images,
  notebook: Notebook,
  text: TextT,
};

export const getKnowledgeIcon = (icon: string | null | undefined): Icon =>
  KNOWLEDGE_ICONS[icon ?? ''] ?? Database;
