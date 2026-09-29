import { useState } from 'react';

import { Spinner } from '@/components/ui/spinner';
import { useGetUsersPaginated } from '@/generated/sys-users/get-users-paginated';
import { useGetDeptTree } from '@/generated/sys-depts/get-dept-tree';

/**
 * 用户管理（管理面板）：列表 + 部门归属 + 角色。
 *
 * 只读视图：**授权（角色分配）走 `PUT /sys/users/{id}`**，是一处高风险写操作，
 * 需要角色下拉与确认反馈；本页面把「谁属于哪个部门、持有哪些角色」如实呈现，
 * 作为 ACL 排查的入口（知识库授权页要填的 principal_id 就从这里查）。
 */

const flattenDepts = (
  nodes: { id: number; name: string; children?: unknown }[],
  depth = 0,
  acc: { id: number; label: string }[] = [],
) => {
  for (const node of nodes) {
    acc.push({ id: node.id, label: `${'　'.repeat(depth)}${node.name}` });
    const children = node.children as typeof nodes | null | undefined;
    if (children?.length) flattenDepts(children, depth + 1, acc);
  }
  return acc;
};

const PAGE_SIZE = 20;

const AdminUsersRoute = () => {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const users = useGetUsersPaginated({
    params: { page, size: PAGE_SIZE, username: keyword || undefined },
  });
  const depts = useGetDeptTree({ params: {} });

  const deptLabels = flattenDepts(depts.data ?? []);
  const deptName = (id?: number | null) =>
    id == null
      ? '-'
      : (deptLabels.find((item) => item.id === id)?.label.trim() ?? String(id));

  const items = users.data?.items ?? [];
  const total = users.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          className="h-8 w-56 rounded-medium border border-color-border-2 bg-color-bg-1 px-2 text-xs outline-none focus:border-color-border-1"
          placeholder="按用户名搜索"
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            setPage(1);
          }}
        />
        <span className="text-[11px] text-muted-foreground">
          共 {total} 个用户
        </span>
      </div>

      {users.isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner className="size-5" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-large border border-color-border-2">
          <table className="w-full text-xs">
            <thead className="bg-color-bg-2 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">ID</th>
                <th className="px-3 py-2 text-left font-medium">用户名</th>
                <th className="px-3 py-2 text-left font-medium">昵称</th>
                <th className="px-3 py-2 text-left font-medium">部门</th>
                <th className="px-3 py-2 text-left font-medium">角色</th>
                <th className="px-3 py-2 text-left font-medium">超管</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                return (
                  <tr key={row.id} className="border-t border-color-border-2">
                    <td className="px-3 py-2 font-mono text-[11px]">
                      {row.id}
                    </td>
                    <td className="px-3 py-2">{row.username}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.nickname}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {deptName(row.dept_id)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.roles?.length
                        ? row.roles.map((role) => role.name).join('、')
                        : '-'}
                    </td>
                    <td className="px-3 py-2">
                      {row.is_superuser ? '是' : '-'}
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 ? (
                <tr>
                  <td
                    className="px-3 py-6 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    没有匹配的用户
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
          <button
            type="button"
            className="rounded-medium px-2 py-1 disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            上一页
          </button>
          <span>
            {page} / {totalPages}
          </span>
          <button
            type="button"
            className="rounded-medium px-2 py-1 disabled:opacity-40"
            disabled={page >= totalPages}
            onClick={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
          >
            下一页
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default AdminUsersRoute;
