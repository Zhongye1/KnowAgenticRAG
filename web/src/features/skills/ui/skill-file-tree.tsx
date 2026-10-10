/**
 * 技能文件树。
 *
 * 按后端 `_build_tree` 的返回递归渲染缩进列表：目录可展开，文件可选中，选中项用
 * `aria-current` 标出。
 */
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
} from 'lucide-react';

import type { SkillFileNode } from '../api/skill-api';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib';

type SkillFileTreeProps = {
  nodes: SkillFileNode[];
  selectedPath: string;
  expanded: string[];
  onSelect: (node: SkillFileNode) => void;
  onToggleExpand: (path: string) => void;
};

export const SkillFileTree = ({
  nodes,
  selectedPath,
  expanded,
  onSelect,
  onToggleExpand,
}: SkillFileTreeProps) => {
  const renderNodes = (items: SkillFileNode[], depth: number) =>
    items.map((node) => {
      const isOpen = node.is_dir && expanded.includes(node.path);
      return (
        <li key={node.path}>
          <div
            className={cn(
              'flex items-center gap-1 rounded-small',
              selectedPath === node.path ? 'bg-color-fill-2' : undefined,
            )}
            style={{ paddingLeft: `${depth * 12}px` }}
          >
            {node.is_dir ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`${isOpen ? '折叠' : '展开'}目录 ${node.name}`}
                aria-expanded={isOpen}
                onClick={() => onToggleExpand(node.path)}
              >
                {isOpen ? (
                  <ChevronDown className="size-3" aria-hidden />
                ) : (
                  <ChevronRight className="size-3" aria-hidden />
                )}
              </Button>
            ) : (
              <span className="size-6" aria-hidden />
            )}
            <button
              type="button"
              aria-current={selectedPath === node.path ? 'true' : undefined}
              className={cn(
                'flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-2 text-left text-xs',
                node.is_dir ? 'text-color-text-2' : 'text-color-text-1',
              )}
              onClick={() =>
                node.is_dir ? onToggleExpand(node.path) : onSelect(node)
              }
            >
              {node.is_dir ? (
                isOpen ? (
                  <FolderOpen className="size-3.5 shrink-0" aria-hidden />
                ) : (
                  <Folder className="size-3.5 shrink-0" aria-hidden />
                )
              ) : (
                <File className="size-3.5 shrink-0" aria-hidden />
              )}
              <span className="truncate font-mono">{node.name}</span>
            </button>
          </div>
          {isOpen && node.children?.length ? (
            <ul>{renderNodes(node.children, depth + 1)}</ul>
          ) : null}
        </li>
      );
    });

  return (
    <ul className="flex flex-col" data-testid="skill-file-tree">
      {renderNodes(nodes, 0)}
    </ul>
  );
};
