"""知识库导出 API（kb-落地改造清单 §9.2）。

三个端点：发起导出、查状态（成功时带预签名下载 URL）、列历史。

**为什么是异步 + 轮询**：大库同步打包必然超时。发起后返回 `export_id`，前端按
`pending → running → success/failed` 轮询；产物在 MinIO，成功时下发短时预签名 URL，
不让 ZIP 字节流经 API 进程。
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query

# 运行期导入（不能放进 TYPE_CHECKING）：FastAPI 生成 OpenAPI 与解析依赖时需按名取到
# 这些别名，移进 TYPE_CHECKING 会变成无法解析的 ForwardRef（见 src/tests/test_openapi_contract.py）。
from backend.src.app.kb.deps import CurrentKbUser, CurrentNamespace
from backend.src.app.kb.schema.export import ExportCreated, ExportItem
from backend.src.app.kb.service.acl.resolver import Perm, perm_at_least, resolve_kb_perm
from backend.src.app.kb.service.export_service import export_service
from backend.src.app.kb.utils.permissions import RAG_KB_READ
from backend.src.app.task.celery import celery_app
from backend.src.common.exception import errors
from backend.src.common.log import log
from backend.src.common.response.response_schema import ResponseSchemaModel, response_base
from backend.src.common.security.jwt import DependsJwtAuth
from backend.src.common.security.permission import RequestPermission
from backend.src.common.security.rbac import DependsRBAC
from backend.src.database.db import CurrentSession, CurrentSessionTransaction

_PERM_READ = [DependsJwtAuth, Depends(RequestPermission(RAG_KB_READ)), DependsRBAC]

router = APIRouter()

_KB_NAME = Annotated[str, Path(description='知识库标识', pattern=r'^[a-z0-9_]+$')]


async def _require_kb_perm(db: CurrentSession, kb_name: str, user: CurrentKbUser, threshold: Perm) -> None:
    """资源级断言：未达阈值与不存在同形态 404（D50 不泄露存在性）。"""
    perm = await resolve_kb_perm(db, user_id=user.user_id, dept_id=user.dept_id, roles=user.roles, kb_name=kb_name)
    if not perm_at_least(perm, threshold):
        raise errors.NotFoundError(msg='知识库不存在')


@router.post('/{kb_name}/export', summary='发起整库导出（异步打包 ZIP）', dependencies=_PERM_READ)
async def create_export(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    kb_name: _KB_NAME,
    user: CurrentKbUser,
) -> ResponseSchemaModel[ExportCreated]:
    """导出含全部文档内容与元数据，故要求 READ 即可发起；产物 URL 同样只在有 READ 时下发。"""
    await _require_kb_perm(db, kb_name, user, Perm.READ)
    data = await export_service.create_export(db=db, kb_name=kb_name, created_by=user.user_id or None)
    try:
        celery_app.send_task('kb.export_build', args=[data['export_id'], current_namespace])
    except Exception as exc:  # 派发失败不该留下一个永远 pending 的任务
        log.warning('派发导出任务失败 export={}: {}', data['export_id'], exc)
        raise errors.RequestError(msg='导出任务派发失败，请稍后重试') from exc
    return response_base.success(data=ExportCreated.model_validate(data))


@router.get('/{kb_name}/exports', summary='导出历史', dependencies=_PERM_READ)
async def list_exports(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    kb_name: _KB_NAME,
    user: CurrentKbUser,
    limit: Annotated[int, Query(ge=1, le=100, description='数量上限')] = 20,
) -> ResponseSchemaModel[list[ExportItem]]:
    await _require_kb_perm(db, kb_name, user, Perm.READ)
    items = await export_service.list_exports(db=db, kb_name=kb_name, limit=limit)
    return response_base.success(data=[ExportItem.model_validate(item) for item in items])


@router.get('/{kb_name}/exports/{export_id}', summary='导出状态（成功时带下载 URL）', dependencies=_PERM_READ)
async def get_export(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    kb_name: _KB_NAME,
    export_id: Annotated[str, Path(description='导出 ID')],
    user: CurrentKbUser,
) -> ResponseSchemaModel[ExportItem]:
    await _require_kb_perm(db, kb_name, user, Perm.READ)
    data = await export_service.get_export(db=db, kb_name=kb_name, export_id=export_id)
    return response_base.success(data=ExportItem.model_validate(data))
