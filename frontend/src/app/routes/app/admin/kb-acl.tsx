import { useState } from 'react';

import { KbAclEditor } from '@/components/knowledge-acl/kb-acl-editor';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { useGetKnowledgeBases } from '@/generated/knowledge_bases/get-knowledge-bases';

/**
 * 知识库授权总览（管理面板）：左侧选库，右侧编辑该库的 ACL。
 *
 * 与知识库详情页内的入口共用同一个 `KbAclEditor`（共享层组件）——这里是「按库找授权」
 * 的全局视角，详情页是「在上下文中改本库」的局部视角。
 */
const AdminKbAclRoute = () => {
  const [selected, setSelected] = useState<string | null>(null);
  // 只列「当前用户可见」的库（default deny 语义）；超管同理，但他通常全可见
  const kbs = useGetKnowledgeBases({ params: { page: 1, size: 100 } });
  const items = kbs.data?.items ?? [];

  return (
    <div className="flex min-h-0 gap-4">
      <aside className="w-56 shrink-0 overflow-y-auto rounded-large border border-color-border-2 p-1">
        {kbs.isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Spinner className="size-4" />
          </div>
        ) : items.length === 0 ? (
          <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">
            暂无可见知识库
          </p>
        ) : (
          <ul className="flex flex-col">
            {items.map((kb) => (
              <li key={kb.kb_name}>
                <button
                  type="button"
                  className={cn(
                    'w-full rounded-medium px-2 py-1.5 text-left text-xs transition-colors',
                    selected === kb.kb_name
                      ? 'bg-color-bg-2 text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => setSelected(kb.kb_name)}
                >
                  <span className="block truncate">{kb.display_name}</span>
                  <span className="block truncate font-mono text-[10px] opacity-70">
                    {kb.kb_name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="min-w-0 flex-1">
        {selected ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs text-muted-foreground">
              正在编辑{' '}
              <span className="font-mono text-foreground">{selected}</span>{' '}
              的授权
            </h3>
            <KbAclEditor kbName={selected} />
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
            从左侧选择一个知识库以编辑其授权
          </div>
        )}
      </section>
    </div>
  );
};

export default AdminKbAclRoute;
