import { CircleAlert, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useGetDeptTree } from '@/generated/sys-depts/get-dept-tree';
import { useGetKbAcl } from '@/generated/knowledge_bases/get-kb-acl';
import { useUpdateKbAcl } from '@/generated/knowledge_bases/update-kb-acl';
import { useGetUsersPaginated } from '@/generated/sys-users/get-users-paginated';
import type { KBAclEntry, GetDeptTree } from '@/generated/types';

/**
 * 知识库授权编辑器（共享组件）。
 *
 * **为什么在 `components/` 而不是某个 feature 里**：管理面板（全局按库授权）与
 * 知识库详情页（在上下文中改本库授权）都要用它，而前端规范禁止 feature 互相引用，
 * 共享能力必须下沉到共享层。
 *
 * 语义要点（对齐 kb-ownership-and-acl-v2）：
 * - KB 级授权有**四种权限级别**（read/contribute/manage/owner）、**deny 优先**、
 *   可设 `expires_at` 过期时间，主体四类（user/dept/role/group）；
 * - 保存是**全量替换**（不是增量），故 UI 必须让用户看到完整条目集再提交。
 */

type EditableEntry = Required<Pick<KBAclEntry, 'principal_id'>> &
  Pick<KBAclEntry, 'principal_type' | 'perm' | 'effect' | 'expires_at'>;

const PRINCIPAL_TYPES = ['user', 'dept', 'role', 'group'] as const;
const PERMS = ['read', 'contribute', 'manage', 'owner'] as const;
const EFFECTS = ['allow', 'deny'] as const;

const asEditable = (entries: KBAclEntry[] | undefined): EditableEntry[] =>
  (entries ?? []).map((entry) => ({
    principal_type: entry.principal_type ?? 'user',
    principal_id: entry.principal_id,
    perm: entry.perm ?? 'read',
    effect: entry.effect ?? 'allow',
    expires_at: entry.expires_at ?? null,
  }));

const flattenDepts = (
  nodes: GetDeptTree[],
  acc: { id: number; label: string }[] = [],
): { id: number; label: string }[] => {
  for (const node of nodes) {
    acc.push({ id: node.id, label: node.name });
    if (node.children?.length) flattenDepts(node.children, acc);
  }
  return acc;
};

const selectClass =
  'h-7 rounded-medium border border-color-border-2 bg-color-bg-1 px-1.5 text-[11px] outline-none focus:border-color-border-1';

export function KbAclEditor({ kbName }: { kbName: string }) {
  const acl = useGetKbAcl({ params: { kb_name: kbName } });
  const users = useGetUsersPaginated({ params: { page: 1, size: 100 } });
  const depts = useGetDeptTree({ params: {} });
  const save = useUpdateKbAcl();

  const [rows, setRows] = useState<EditableEntry[]>([]);
  const [dirty, setDirty] = useState(false);

  // 服务端数据到达后灌入编辑态；用户改动后不再被覆盖（dirty 门闩）
  useEffect(() => {
    if (!dirty) setRows(asEditable(acl.data?.entries));
  }, [acl.data, dirty]);

  const principalOptions = useMemo(() => {
    const userOptions = (users.data?.items ?? []).map((user) => ({
      id: String(user.id),
      label: `${user.username}（${user.nickname}）`,
    }));
    const deptOptions = flattenDepts(depts.data ?? []).map((dept) => ({
      id: String(dept.id),
      label: dept.label,
    }));
    return { user: userOptions, dept: deptOptions, role: [], group: [] };
  }, [users.data, depts.data]);

  const update = (index: number, patch: Partial<EditableEntry>) => {
    setDirty(true);
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  const addRow = () => {
    setDirty(true);
    setRows((current) => [
      ...current,
      {
        principal_type: 'user',
        principal_id: '',
        perm: 'read',
        effect: 'allow',
        expires_at: null,
      },
    ]);
  };

  const removeRow = (index: number) => {
    setDirty(true);
    setRows((current) => current.filter((_row, i) => i !== index));
  };

  const submit = () => {
    save.mutate(
      {
        kb_name: kbName,
        data: { entries: rows.filter((row) => row.principal_id.trim()) },
      },
      {
        onSuccess: () => {
          setDirty(false);
          void acl.refetch();
        },
      },
    );
  };

  if (acl.isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Spinner className="size-5" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
        <span>
          保存是**全量替换**：提交后以此处条目为准。deny 优先于
          allow；不填过期时间即长期有效。 无任何条目且库非公开时，除 Owner
          外无人可见（default deny）。
        </span>
      </p>

      <div className="overflow-x-auto rounded-large border border-color-border-2">
        <table className="w-full text-xs">
          <thead className="bg-color-bg-2 text-muted-foreground">
            <tr>
              <th className="px-2 py-2 text-left font-medium">主体类型</th>
              <th className="px-2 py-2 text-left font-medium">主体 ID</th>
              <th className="px-2 py-2 text-left font-medium">权限</th>
              <th className="px-2 py-2 text-left font-medium">效果</th>
              <th className="px-2 py-2 text-left font-medium">过期时间</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const options =
                principalOptions[
                  row.principal_type as keyof typeof principalOptions
                ] ?? [];
              const listId = `acl-principal-${row.principal_type}`;
              return (
                <tr
                  key={`${row.principal_type}-${index}`}
                  className="border-t border-color-border-2"
                >
                  <td className="px-2 py-1.5">
                    <select
                      className={selectClass}
                      value={row.principal_type}
                      onChange={(event) =>
                        update(index, { principal_type: event.target.value })
                      }
                    >
                      {PRINCIPAL_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      className={`${selectClass} w-40`}
                      list={options.length ? listId : undefined}
                      placeholder={
                        row.principal_type === 'user' ? '用户 ID' : '主体 ID'
                      }
                      value={row.principal_id}
                      onChange={(event) =>
                        update(index, { principal_id: event.target.value })
                      }
                    />
                    {options.length ? (
                      <datalist id={listId}>
                        {options.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </datalist>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      className={selectClass}
                      value={row.perm}
                      onChange={(event) =>
                        update(index, { perm: event.target.value })
                      }
                    >
                      {PERMS.map((perm) => (
                        <option key={perm} value={perm}>
                          {perm}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      className={selectClass}
                      value={row.effect}
                      onChange={(event) =>
                        update(index, { effect: event.target.value })
                      }
                    >
                      {EFFECTS.map((effect) => (
                        <option key={effect} value={effect}>
                          {effect}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="date"
                      className={`${selectClass} w-32`}
                      value={row.expires_at ? row.expires_at.slice(0, 10) : ''}
                      onChange={(event) =>
                        update(index, {
                          expires_at: event.target.value
                            ? new Date(
                                `${event.target.value}T23:59:59Z`,
                              ).toISOString()
                            : null,
                        })
                      }
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="删除该条授权"
                      onClick={() => removeRow(index)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td
                  className="px-2 py-5 text-center text-muted-foreground"
                  colSpan={6}
                >
                  暂无授权条目（default deny：除 Owner 外无人可见）
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="size-4" />
          添加条目
        </Button>
        <div className="flex items-center gap-2">
          {save.isError ? (
            <span className="text-[11px] text-muted-foreground">
              保存失败，请重试
            </span>
          ) : null}
          <Button
            size="sm"
            disabled={!dirty || save.isPending}
            onClick={submit}
          >
            <Save className="size-4" />
            {save.isPending ? '保存中…' : '保存授权'}
          </Button>
        </div>
      </div>
    </div>
  );
}
