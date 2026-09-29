"""知识库文件夹服务（kb-落地改造清单 D51）。

职责：树组装、同级重名判定、移动环检测、删除时子项上浮。

**不做授权**（D53）：文件夹仅组织语义。权限仍由 KB 级与文档级 ACL 表达，
路由层已用 ``_require_kb_perm`` 把关，本服务不再引入第三段判定链。
"""

from typing import Any
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.kb.crud import document_dao, folder_dao
from backend.src.app.kb.model import KbFolder
from backend.src.app.kb.schema.folder import (
    FolderCreateParam,
    FolderMoveParam,
    FolderTreeNode,
    FolderUpdateParam,
)
from backend.src.common.exception import errors


class FolderService:
    """知识库文件夹业务逻辑。"""

    @staticmethod
    def _to_item(folder: KbFolder, counts: dict[str, int]) -> dict:
        return {
            'folder_id': folder.folder_id,
            'kb_name': folder.kb_name,
            'plugin_namespace': folder.plugin_namespace,
            'parent_id': folder.parent_id,
            'name': folder.name,
            'sort_order': folder.sort_order,
            'document_count': counts.get(folder.folder_id, 0),
            'created_time': folder.created_time,
            'updated_time': folder.updated_time,
        }

    @staticmethod
    def _build_tree(folders: list[KbFolder], counts: dict[str, int]) -> list[FolderTreeNode]:
        """一次取全量后在内存组装（单库文件夹是百级量级，无需递归 CTE）。"""
        nodes: dict[str, FolderTreeNode] = {
            folder.folder_id: FolderTreeNode(**FolderService._to_item(folder, counts)) for folder in folders
        }
        roots: list[FolderTreeNode] = []
        for folder in folders:
            node = nodes[folder.folder_id]
            parent = nodes.get(folder.parent_id) if folder.parent_id else None
            if parent is None:
                # 父级缺失（并发删除/脏数据）时按根节点处理，不让整棵树查询失败
                roots.append(node)
            else:
                parent.children.append(node)
        return roots

    @staticmethod
    async def list_tree(*, db: AsyncSession, kb_name: str) -> list[FolderTreeNode]:
        """取文件夹树（含每级文档数），根级用 ``parent_id=None``。"""
        folders = await folder_dao.list_by_kb(db, kb_name)
        counts = await document_dao.count_by_folder(db, kb_name=kb_name)
        return FolderService._build_tree(folders, counts)

    @staticmethod
    async def list_flat(*, db: AsyncSession, kb_name: str) -> list[dict]:
        """取扁平列表（供前端下拉/移动目标选择）。"""
        folders = await folder_dao.list_by_kb(db, kb_name)
        counts = await document_dao.count_by_folder(db, kb_name=kb_name)
        return [FolderService._to_item(folder, counts) for folder in folders]

    @staticmethod
    async def _require_folder(*, db: AsyncSession, kb_name: str, folder_id: str) -> KbFolder:
        """加载并校验文件夹属于本知识库。"""
        folder = await folder_dao.select_scoped(db, plugin_namespace=None, folder_id=folder_id)
        if folder is None or folder.kb_name != kb_name:
            raise errors.NotFoundError(msg='文件夹不存在')
        return folder

    @staticmethod
    async def _require_parent(*, db: AsyncSession, kb_name: str, parent_id: str | None) -> None:
        """校验目标父级存在且属于本知识库（None = 根目录，合法）。"""
        if parent_id is None:
            return
        await FolderService._require_folder(db=db, kb_name=kb_name, folder_id=parent_id)

    @staticmethod
    async def _reload_item(*, db: AsyncSession, kb_name: str, folder_id: str) -> dict:
        """变更后重读并转 DTO（拿 DB 侧 onupdate 结果，不手工拼装）。"""
        folder = await FolderService._require_folder(db=db, kb_name=kb_name, folder_id=folder_id)
        return FolderService._to_item(folder, {})

    @staticmethod
    async def create(*, db: AsyncSession, kb_name: str, obj: FolderCreateParam) -> dict:
        """新建文件夹（同级重名冲突）。"""
        await FolderService._require_parent(db=db, kb_name=kb_name, parent_id=obj.parent_id)
        if await folder_dao.name_taken(db, kb_name=kb_name, parent_id=obj.parent_id, name=obj.name):
            raise errors.ConflictError(msg=f'同级已存在文件夹 {obj.name}')
        folder = await folder_dao.create(
            db,
            folder_id=uuid4().hex,
            kb_name=kb_name,
            name=obj.name,
            parent_id=obj.parent_id,
            sort_order=obj.sort_order,
        )
        return FolderService._to_item(folder, {})

    @staticmethod
    async def update(*, db: AsyncSession, kb_name: str, folder_id: str, obj: FolderUpdateParam) -> dict:
        """改名 / 改排序。"""
        folder = await FolderService._require_folder(db=db, kb_name=kb_name, folder_id=folder_id)
        fields: dict[str, Any] = {}
        if obj.name is not None and obj.name != folder.name:
            if await folder_dao.name_taken(
                db, kb_name=kb_name, parent_id=folder.parent_id, name=obj.name, exclude_folder_id=folder_id
            ):
                raise errors.ConflictError(msg=f'同级已存在文件夹 {obj.name}')
            fields['name'] = obj.name
        if obj.sort_order is not None:
            fields['sort_order'] = obj.sort_order
        await folder_dao.update_fields(db, folder_id, fields)
        return await FolderService._reload_item(db=db, kb_name=kb_name, folder_id=folder_id)

    @staticmethod
    async def move(*, db: AsyncSession, kb_name: str, folder_id: str, obj: FolderMoveParam) -> dict:
        """移动文件夹（禁止移到自身或自身子孙——环检测）。"""
        folder = await FolderService._require_folder(db=db, kb_name=kb_name, folder_id=folder_id)
        target = obj.parent_id
        if target == folder_id:
            raise errors.RequestError(msg='不能把文件夹移动到自身')
        await FolderService._require_parent(db=db, kb_name=kb_name, parent_id=target)
        if target is not None:
            descendants = await FolderService._descendant_ids(db=db, kb_name=kb_name, folder_id=folder_id)
            if target in descendants:
                raise errors.RequestError(msg='不能把文件夹移动到自身的子文件夹下')
        if await folder_dao.name_taken(
            db, kb_name=kb_name, parent_id=target, name=folder.name, exclude_folder_id=folder_id
        ):
            raise errors.ConflictError(msg=f'目标目录下已存在文件夹 {folder.name}')
        fields: dict[str, Any] = {'parent_id': target}
        if obj.sort_order is not None:
            fields['sort_order'] = obj.sort_order
        await folder_dao.update_fields(db, folder_id, fields)
        return await FolderService._reload_item(db=db, kb_name=kb_name, folder_id=folder_id)

    @staticmethod
    async def _descendant_ids(*, db: AsyncSession, kb_name: str, folder_id: str) -> set[str]:
        """收集自身全部子孙文件夹 ID（一次取全量后内存遍历）。"""
        folders = await folder_dao.list_by_kb(db, kb_name)
        children: dict[str | None, list[str]] = {}
        for folder in folders:
            children.setdefault(folder.parent_id, []).append(folder.folder_id)
        seen: set[str] = set()
        stack = list(children.get(folder_id, []))
        while stack:
            current = stack.pop()
            if current in seen:
                continue
            seen.add(current)
            stack.extend(children.get(current, []))
        return seen

    @staticmethod
    async def delete(*, db: AsyncSession, kb_name: str, folder_id: str) -> dict:
        """删除文件夹：子文件夹与文档**上浮到父级**，不级联删除（D51）。"""
        folder = await FolderService._require_folder(db=db, kb_name=kb_name, folder_id=folder_id)
        parent_id = folder.parent_id
        child_folders = await folder_dao.list_children(db, folder_id, kb_name=kb_name)
        for child in child_folders:
            await folder_dao.update_fields(db, child.folder_id, {'parent_id': parent_id})
        moved_documents = await document_dao.reparent_by_folder(db, folder_id, parent_id, kb_name=kb_name)
        await folder_dao.delete(db, folder_id)
        return {
            'folder_id': folder_id,
            'promoted_folders': len(child_folders),
            'promoted_documents': moved_documents,
        }

    @staticmethod
    async def move_document(*, db: AsyncSession, kb_name: str, document_id: str, folder_id: str | None) -> int:
        """把文档移动到目标文件夹（None = 根目录）。"""
        doc = await document_dao.get(db, document_id, kb_name=kb_name)
        if doc is None:
            raise errors.NotFoundError(msg='文档不存在')
        await FolderService._require_parent(db=db, kb_name=kb_name, parent_id=folder_id)
        rowcount = await document_dao.move_to_folder(db, document_id, folder_id, kb_name=kb_name)
        if rowcount == 0:
            raise errors.NotFoundError(msg='文档不存在')
        return rowcount


folder_service = FolderService()
