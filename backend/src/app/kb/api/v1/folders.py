"""知识库文件夹 API（kb-落地改造清单 D51）。

权限：读走 ``rag:kb:list`` + READ；结构变更（建/改名/移动/删除）走 ``rag:kb:manage``
+ MANAGE；移动**文档**走 ``rag:kb:ingest`` + CONTRIBUTE（与替换文件同级，属文档操作）。

资源级断言复用文档接口的 ``_require_kb_perm`` 语义：未达阈值与不存在同形态 404（D50）。
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Path

from backend.src.app.kb.deps import CurrentKbUser
from backend.src.app.kb.schema.folder import (
    FolderCreateParam,
    FolderItem,
    FolderMoveParam,
    FolderTreeNode,
    FolderUpdateParam,
)
from backend.src.app.kb.service.acl.resolver import Perm, perm_at_least, resolve_kb_perm
from backend.src.app.kb.service.folder_service import folder_service
from backend.src.app.kb.utils.permissions import RAG_KB_LIST, RAG_KB_MANAGE
from backend.src.common.exception import errors
from backend.src.common.response.response_schema import ResponseSchemaModel, response_base
from backend.src.common.security.jwt import DependsJwtAuth
from backend.src.common.security.permission import RequestPermission
from backend.src.common.security.rbac import DependsRBAC
from backend.src.database.db import CurrentSession, CurrentSessionTransaction

_PERM_LIST = [DependsJwtAuth, Depends(RequestPermission(RAG_KB_LIST)), DependsRBAC]
_PERM_MANAGE = [DependsJwtAuth, Depends(RequestPermission(RAG_KB_MANAGE)), DependsRBAC]

router = APIRouter()

_KB_NAME = Annotated[str, Path(description='知识库标识', pattern=r'^[a-z0-9_]+$')]
_FOLDER_ID = Annotated[str, Path(description='文件夹 ID')]


async def _require_kb_perm(db: CurrentSession, kb_name: str, user: CurrentKbUser, threshold: Perm) -> None:
    """资源级权限断言：未达阈值与知识库不存在同形态 404（不泄露存在性，D50）。"""
    perm = await resolve_kb_perm(db, user_id=user.user_id, dept_id=user.dept_id, roles=user.roles, kb_name=kb_name)
    if not perm_at_least(perm, threshold):
        raise errors.NotFoundError(msg='知识库不存在')


@router.get(
    '/{kb_name}/folders/tree',
    summary='文件夹树（含每级文档数）',
    dependencies=_PERM_LIST,
)
async def get_folder_tree(
    db: CurrentSession,
    kb_name: _KB_NAME,
    user: CurrentKbUser,
) -> ResponseSchemaModel[list[FolderTreeNode]]:
    await _require_kb_perm(db, kb_name, user, Perm.READ)
    return response_base.success(data=await folder_service.list_tree(db=db, kb_name=kb_name))


@router.get('/{kb_name}/folders', summary='文件夹扁平列表', dependencies=_PERM_LIST)
async def get_folders(
    db: CurrentSession,
    kb_name: _KB_NAME,
    user: CurrentKbUser,
) -> ResponseSchemaModel[list[FolderItem]]:
    await _require_kb_perm(db, kb_name, user, Perm.READ)
    items = await folder_service.list_flat(db=db, kb_name=kb_name)
    return response_base.success(data=[FolderItem.model_validate(item) for item in items])


@router.post('/{kb_name}/folders', summary='新建文件夹', dependencies=_PERM_MANAGE)
async def create_folder(
    db: CurrentSessionTransaction,
    kb_name: _KB_NAME,
    obj: FolderCreateParam,
    user: CurrentKbUser,
) -> ResponseSchemaModel[FolderItem]:
    await _require_kb_perm(db, kb_name, user, Perm.MANAGE)
    data = await folder_service.create(db=db, kb_name=kb_name, obj=obj)
    return response_base.success(data=FolderItem.model_validate(data))


@router.patch('/{kb_name}/folders/{folder_id}', summary='重命名 / 改排序', dependencies=_PERM_MANAGE)
async def update_folder(
    db: CurrentSessionTransaction,
    kb_name: _KB_NAME,
    folder_id: _FOLDER_ID,
    obj: FolderUpdateParam,
    user: CurrentKbUser,
) -> ResponseSchemaModel[FolderItem]:
    await _require_kb_perm(db, kb_name, user, Perm.MANAGE)
    data = await folder_service.update(db=db, kb_name=kb_name, folder_id=folder_id, obj=obj)
    return response_base.success(data=FolderItem.model_validate(data))


@router.post('/{kb_name}/folders/{folder_id}/move', summary='移动文件夹', dependencies=_PERM_MANAGE)
async def move_folder(
    db: CurrentSessionTransaction,
    kb_name: _KB_NAME,
    folder_id: _FOLDER_ID,
    obj: FolderMoveParam,
    user: CurrentKbUser,
) -> ResponseSchemaModel[FolderItem]:
    await _require_kb_perm(db, kb_name, user, Perm.MANAGE)
    data = await folder_service.move(db=db, kb_name=kb_name, folder_id=folder_id, obj=obj)
    return response_base.success(data=FolderItem.model_validate(data))


@router.delete('/{kb_name}/folders/{folder_id}', summary='删除文件夹（子项上浮到父级）', dependencies=_PERM_MANAGE)
async def delete_folder(
    db: CurrentSessionTransaction,
    kb_name: _KB_NAME,
    folder_id: _FOLDER_ID,
    user: CurrentKbUser,
) -> ResponseSchemaModel[dict]:
    await _require_kb_perm(db, kb_name, user, Perm.MANAGE)
    return response_base.success(data=await folder_service.delete(db=db, kb_name=kb_name, folder_id=folder_id))
