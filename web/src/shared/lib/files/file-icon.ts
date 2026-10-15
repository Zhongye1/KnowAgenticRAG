/**
 * 文件 / 文件夹类型图标（彩色 SVG），用于在文件路径前渲染。
 *
 * 参照实现 `Yuxi/web/src/utils/file_icon.js` 与 `components/common/FileTypeIcon.vue`
 * 逐条对齐：扩展名映射、目录变体、回退到通用文件图标。资源是 `assets/icons/files/`
 * 下的 23 个 SVG（从参照工程原样复制）。
 */
import archiveIcon from '@/assets/icons/files/archive.svg';
import audioIcon from '@/assets/icons/files/audio.svg';
import cadIcon from '@/assets/icons/files/cad.svg';
import codeIcon from '@/assets/icons/files/code.svg';
import fileIcon from '@/assets/icons/files/file.svg';
import folderAgentIcon from '@/assets/icons/files/folder-agent.svg';
import folderEnterpriseIcon from '@/assets/icons/files/folder-enterprise.svg';
import folderFavoriteIcon from '@/assets/icons/files/folder-favorite.svg';
import folderIcon from '@/assets/icons/files/folder.svg';
import folderKnowledgeIcon from '@/assets/icons/files/folder-knowledge.svg';
import folderPersonalIcon from '@/assets/icons/files/folder-personal.svg';
import folderTrashIcon from '@/assets/icons/files/folder-trash.svg';
import imageIcon from '@/assets/icons/files/image.svg';
import markdownIcon from '@/assets/icons/files/markdown.svg';
import pdfIcon from '@/assets/icons/files/pdf.svg';
import pptIcon from '@/assets/icons/files/ppt.svg';
import psdIcon from '@/assets/icons/files/psd.svg';
import pythonIcon from '@/assets/icons/files/python.svg';
import spreadsheetIcon from '@/assets/icons/files/spreadsheet.svg';
import textIcon from '@/assets/icons/files/text.svg';
import videoIcon from '@/assets/icons/files/video.svg';
import webIcon from '@/assets/icons/files/web.svg';
import wordIcon from '@/assets/icons/files/word.svg';

export const FOLDER_ICONS = {
  default: folderIcon,
  agent: folderAgentIcon,
  enterprise: folderEnterpriseIcon,
  favorite: folderFavoriteIcon,
  knowledge: folderKnowledgeIcon,
  personal: folderPersonalIcon,
  trash: folderTrashIcon,
} as const;

export type FolderVariant = keyof typeof FOLDER_ICONS;

const EXTENSION_ICONS: Record<string, string> = {
  // 文档
  pdf: pdfIcon,
  doc: wordIcon,
  docx: wordIcon,
  rtf: wordIcon,
  ppt: pptIcon,
  pptx: pptIcon,
  xls: spreadsheetIcon,
  xlsx: spreadsheetIcon,
  csv: spreadsheetIcon,
  // 文本 / Markdown
  txt: textIcon,
  text: textIcon,
  log: textIcon,
  md: markdownIcon,
  markdown: markdownIcon,
  mdx: markdownIcon,
  // 代码
  py: pythonIcon,
  js: codeIcon,
  mjs: codeIcon,
  cjs: codeIcon,
  jsx: codeIcon,
  ts: codeIcon,
  tsx: codeIcon,
  vue: codeIcon,
  json: codeIcon,
  yaml: codeIcon,
  yml: codeIcon,
  toml: codeIcon,
  ini: codeIcon,
  conf: codeIcon,
  env: codeIcon,
  sh: codeIcon,
  bash: codeIcon,
  bat: codeIcon,
  go: codeIcon,
  rs: codeIcon,
  c: codeIcon,
  h: codeIcon,
  cpp: codeIcon,
  java: codeIcon,
  css: codeIcon,
  less: codeIcon,
  scss: codeIcon,
  sql: codeIcon,
  xml: codeIcon,
  // 网页
  html: webIcon,
  htm: webIcon,
  // 图片
  png: imageIcon,
  jpg: imageIcon,
  jpeg: imageIcon,
  gif: imageIcon,
  bmp: imageIcon,
  webp: imageIcon,
  svg: imageIcon,
  apng: imageIcon,
  avif: imageIcon,
  ico: imageIcon,
  // 设计 / 工程
  psd: psdIcon,
  dwg: cadIcon,
  dxf: cadIcon,
  // 音视频
  mp3: audioIcon,
  wav: audioIcon,
  flac: audioIcon,
  aac: audioIcon,
  ogg: audioIcon,
  m4a: audioIcon,
  mp4: videoIcon,
  mov: videoIcon,
  avi: videoIcon,
  mkv: videoIcon,
  webm: videoIcon,
  flv: videoIcon,
  // 压缩包
  zip: archiveIcon,
  rar: archiveIcon,
  '7z': archiveIcon,
  tar: archiveIcon,
  gz: archiveIcon,
};

const getExtension = (name: string): string => {
  const cleanName = String(name ?? '')
    .trim()
    .toLowerCase()
    .split(/[?#]/)[0];
  const fileName = cleanName.split('/').pop() ?? '';
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0) return '';
  return fileName.slice(dotIndex + 1);
};

/** 解析文件 / 文件夹对应的彩色图标 URL；未登记扩展名回落通用文件图标。 */
export const resolveFileIconUrl = (
  name: string,
  {
    isDir = false,
    folderVariant = 'default',
  }: { isDir?: boolean; folderVariant?: FolderVariant } = {},
): string => {
  const isDirectory = isDir || String(name ?? '').endsWith('/');
  if (isDirectory) return FOLDER_ICONS[folderVariant] ?? FOLDER_ICONS.default;
  return EXTENSION_ICONS[getExtension(name)] ?? fileIcon;
};
