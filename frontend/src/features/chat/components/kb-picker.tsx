import { LibraryBig } from 'lucide-react';
import { useEffect, useMemo } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useGetKnowledgeBases } from '@/generated/knowledge_bases/get-knowledge-bases';

import { useChatSettingsStore } from '../stores/chat-settings-store';

/** 问答目标知识库选择器（数据来自 rag:kb:list，服务端已按 ACL 过滤） */
export const KbPicker = () => {
  const { data, isLoading } = useGetKnowledgeBases({
    params: { page: 1, size: 200 },
  });
  const kbName = useChatSettingsStore((s) => s.kbName);
  const setKbName = useChatSettingsStore((s) => s.setKbName);

  const items = useMemo(() => data?.items ?? [], [data]);

  // 持久化的选择可能已被删除/无权限：自动回落到未选择
  useEffect(() => {
    if (kbName && items.length > 0 && !items.some((kb) => kb.kb_name === kbName)) {
      setKbName(null);
    }
  }, [kbName, items, setKbName]);

  return (
    <Select value={kbName ?? ''} onValueChange={(value) => setKbName(value || null)}>
      <SelectTrigger className="w-64" aria-label="选择知识库">
        <LibraryBig className="text-muted-foreground size-4 shrink-0" />
        <SelectValue
          placeholder={isLoading ? '加载知识库…' : '选择知识库'}
        />
      </SelectTrigger>
      <SelectContent>
        {items.length === 0 ? (
          <div className="text-muted-foreground px-3 py-2 text-sm">
            {isLoading ? '加载中…' : '暂无可用知识库'}
          </div>
        ) : (
          items.map((kb) => (
            <SelectItem key={kb.kb_name} value={kb.kb_name}>
              {kb.display_name || kb.kb_name}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
};
