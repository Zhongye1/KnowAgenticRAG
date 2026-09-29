import { Spinner } from '@/components/ui/spinner';
import { useGetDeptTree } from '@/generated/sys-depts/get-dept-tree';
import type { GetDeptTree } from '@/generated/types';

/**
 * 组织（部门）管理：树形只读视图。
 *
 * 部门是 ACL 里的主体类型之一（`principal_type=dept`），所以这一页的主要用途是
 * **查部门 ID**——知识库授权页要填的 `principal_id` 就是这里的 `id`。
 */

const DeptNode = ({ node, depth }: { node: GetDeptTree; depth: number }) => (
  <li>
    <div
      className="flex items-center gap-2 rounded-medium px-2 py-1.5 text-xs hover:bg-color-bg-2"
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
    >
      <span className="font-mono text-[11px] text-muted-foreground">
        {node.id}
      </span>
      <span className="text-foreground">{node.name}</span>
      {node.leader ? (
        <span className="text-[11px] text-muted-foreground">
          负责人 {node.leader}
        </span>
      ) : null}
      {node.status === 0 ? (
        <span className="text-[11px] text-muted-foreground">（已停用）</span>
      ) : null}
    </div>
    {node.children?.length ? (
      <ul>
        {node.children.map((child) => (
          <DeptNode key={child.id} node={child} depth={depth + 1} />
        ))}
      </ul>
    ) : null}
  </li>
);

const AdminDeptsRoute = () => {
  const depts = useGetDeptTree({ params: {} });

  if (depts.isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner className="size-5" />
      </div>
    );
  }

  const tree = depts.data ?? [];

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-muted-foreground">
        部门是知识库/文档授权的主体之一；授权页填的部门 ID 即此处的编号。
      </p>
      {tree.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
          暂无部门
        </div>
      ) : (
        <ul className="rounded-large border border-color-border-2 py-1">
          {tree.map((node) => (
            <DeptNode key={node.id} node={node} depth={0} />
          ))}
        </ul>
      )}
    </div>
  );
};

export default AdminDeptsRoute;
