import { useState } from 'react';

import { Spinner } from '@/components/ui/spinner';
import { useGetRolesPaginated } from '@/generated/sys-roles/get-roles-paginated';

/**
 * 角色管理（管理面板）：列表 + 数据范围开关。
 *
 * 角色决定「功能权限码」的集合，进而决定用户能调哪些接口。知识库的资源级权限
 * 另由 ACL 表达（见知识库授权页）——两者是**与**关系：先有功能码，再看资源授权。
 */

const PAGE_SIZE = 20;

const AdminRolesRoute = () => {
  const [page, setPage] = useState(1);
  const roles = useGetRolesPaginated({ params: { page, size: PAGE_SIZE } });

  const items = roles.data?.items ?? [];
  const total = roles.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (roles.isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner className="size-5" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[11px] text-muted-foreground">
        共 {total} 个角色
      </span>
      <div className="overflow-x-auto rounded-large border border-color-border-2">
        <table className="w-full text-xs">
          <thead className="bg-color-bg-2 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">ID</th>
              <th className="px-3 py-2 text-left font-medium">名称</th>
              <th className="px-3 py-2 text-left font-medium">备注</th>
              <th className="px-3 py-2 text-left font-medium">数据范围过滤</th>
              <th className="px-3 py-2 text-left font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {items.map((role) => (
              <tr key={role.id} className="border-t border-color-border-2">
                <td className="px-3 py-2 font-mono text-[11px]">{role.id}</td>
                <td className="px-3 py-2">{role.name}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {role.remark ?? '-'}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {role.is_filter_scopes ? '是' : '否'}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {role.status === 1 ? '正常' : '停用'}
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-6 text-center text-muted-foreground"
                  colSpan={5}
                >
                  暂无角色
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

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

export default AdminRolesRoute;
