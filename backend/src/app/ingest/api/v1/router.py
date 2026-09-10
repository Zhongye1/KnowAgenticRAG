"""摄取/状态/rebuild API（ragf-design §7；D13 格式子集 415；D12 rebuild 受理）。"""

from pathlib import PurePosixPath
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Path, Request, UploadFile
from starlette.authentication import UnauthenticatedUser

from backend.src.app.ingest.schema.ingest import DocumentStatusItem, IngestResultItem, RebuildResultItem
from backend.src.app.kb.crud import dedup_dao, document_dao, knowledge_base_dao
from backend.src.app.kb.crud.crud_dedup import compute_sha256_bytes
from backend.src.app.kb.deps import CurrentNamespace
from backend.src.app.kb.service.document_service import document_service
from backend.src.app.kb.utils.permissions import RAG_KB_INGEST, RAG_KB_LIST
from backend.src.common.exception import errors
from backend.src.common.response.response_schema import ResponseSchemaModel, response_base
from backend.src.common.security.jwt import DependsJwtAuth
from backend.src.common.security.permission import RequestPermission
from backend.src.common.security.rbac import DependsRBAC
from backend.src.database.db import CurrentSessionTransaction

router = APIRouter(dependencies=[DependsJwtAuth])

_PERM_LIST = [DependsJwtAuth, Depends(RequestPermission(RAG_KB_LIST)), DependsRBAC]
_PERM_INGEST = [DependsJwtAuth, Depends(RequestPermission(RAG_KB_INGEST)), DependsRBAC]

INGEST_EXTENSIONS = frozenset({'.pdf', '.docx', '.pptx', '.md', '.txt', '.csv', '.png', '.jpg'})


def _ensure_supported_format(filename: str) -> None:
    """上传格式子集校验（D13）：子集外 415（代码保留，后续按引擎能力开启）。"""
    ext = PurePosixPath(filename).suffix.lower()
    if ext not in INGEST_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f'不支持的文件格式: {ext or "(无扩展名)"}；支持: {sorted(INGEST_EXTENSIONS)}',
        )


def _enqueue_ingest(document_id: str, kb_name: str, plugin_namespace: str) -> None:
    from backend.src.app.task.celery import celery_app

    celery_app.send_task(
        'ingest.process_document',
        kwargs={
            'document_id': document_id,
            'kb_name': kb_name,
            'plugin_namespace': plugin_namespace,
        },
    )


@router.post(
    '/{kb_name}/documents/ingest',
    summary='上传并触发摄取（幂等去重 409；force=1 强制重摄取）',
    dependencies=_PERM_INGEST,
)
async def ingest_document(
    request: Request,
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    kb_name: Annotated[str, Path(description='知识库标识', pattern=r'^[a-z0-9_]+$')],
    file: Annotated[UploadFile, File(description='文档文件（D13 格式子集）')],
    chunk_preset_id: Annotated[str | None, Form(description='分块预设（general/qa/separator/…）')] = None,
    ocr_engine: Annotated[str | None, Form(description='OCR 引擎（pdf/图片；缺省走 settings）')] = None,
    *,
    force: Annotated[bool, Form(description='强制重摄取（同指纹文档）')] = False,
) -> ResponseSchemaModel[IngestResultItem]:
    kb = await knowledge_base_dao.get(db, kb_name, plugin_namespace=current_namespace)
    if kb is None:
        raise errors.NotFoundError(msg=f'知识库不存在: {kb_name}')
    filename = (file.filename or '').strip() or 'file'
    _ensure_supported_format(filename)

    # 上传者身份（入库打标：owner_id + 默认 restricted + 上传者部门组，§8.1）
    owner_id = None if isinstance(request.user, UnauthenticatedUser) else str(request.user.id)
    owner_dept_id = None if isinstance(request.user, UnauthenticatedUser) else request.user.dept_id

    data = await file.read()
    if not data:
        raise errors.RequestError(msg='文件内容为空')
    await file.seek(0)

    # 摄取限额（双管线摄取 spec D8）：MinerU 上限（200 MiB / 200 页）前置拒绝，422 结构化 detail
    from backend.src.app.ingest.limits import IngestLimitError, validate_ingest_bytes

    try:
        validate_ingest_bytes(data, filename)
    except IngestLimitError as exc:
        raise HTTPException(status_code=422, detail=exc.to_detail()) from exc

    sha256 = compute_sha256_bytes(data)
    existing = await dedup_dao.get_by_sha256(db, sha256, kb_name=kb_name, plugin_namespace=current_namespace)
    if existing is not None and not force:
        raise errors.ConflictError(msg='该文件已存在于知识库中（需强制重摄取请带 force=1）')

    if existing is not None and force:
        doc = await document_dao.get(db, existing.document_id, kb_name=kb_name, plugin_namespace=current_namespace)
        if doc is None:
            raise errors.NotFoundError(msg='去重记录指向的文档不存在')
    else:
        doc = await document_service.upload(
            db=db, kb_name=kb_name, file=file, source_type='file', owner_id=owner_id, owner_dept_id=owner_dept_id
        )

    doc.ingest_params = {
        'chunk_preset_id': chunk_preset_id or (doc.ingest_params or {}).get('chunk_preset_id') or 'general',
        'ocr_engine': ocr_engine or '',
    }
    await db.flush()
    _enqueue_ingest(doc.document_id, doc.kb_name, doc.plugin_namespace)
    return response_base.success(
        data=IngestResultItem(
            document_id=doc.document_id,
            kb_name=doc.kb_name,
            name=doc.name,
            sha256=sha256,
            status=doc.status,
            queued=True,
        )
    )


@router.get(
    '/{kb_name}/documents/{document_id}/status',
    summary='文档摄取状态/进度',
    dependencies=_PERM_LIST,
)
async def get_document_status(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    kb_name: Annotated[str, Path(description='知识库标识')],
    document_id: Annotated[str, Path(description='文档 ID')],
) -> ResponseSchemaModel[DocumentStatusItem]:
    doc = await document_dao.get(db, document_id, kb_name=kb_name, plugin_namespace=current_namespace)
    if doc is None:
        raise errors.NotFoundError(msg='文档不存在')
    return response_base.success(
        data=DocumentStatusItem(
            document_id=doc.document_id,
            kb_name=doc.kb_name,
            plugin_namespace=doc.plugin_namespace,
            name=doc.name,
            status=doc.status,
            chunk_count=doc.chunk_count,
            error_message=doc.error_message,
            ingest_params=doc.ingest_params or {},
            created_time=doc.created_time,
            updated_time=doc.updated_time,
        )
    )


@router.post(
    '/{kb_name}/rebuild',
    summary='KB 级全量重摄取（D12：遍历文档复用 ingest 任务）',
    dependencies=_PERM_INGEST,
)
async def rebuild_knowledge_base(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    kb_name: Annotated[str, Path(description='知识库标识')],
) -> ResponseSchemaModel[RebuildResultItem]:
    kb = await knowledge_base_dao.get(db, kb_name, plugin_namespace=current_namespace)
    if kb is None:
        raise errors.NotFoundError(msg=f'知识库不存在: {kb_name}')
    stmt = await document_dao.get_select(kb_name=kb_name, plugin_namespace=current_namespace)
    documents = list((await db.execute(stmt)).scalars().all())
    dispatched = 0
    skipped = 0
    for doc in documents:
        if doc.status in {'parsing', 'indexing'}:
            skipped += 1
            continue
        _enqueue_ingest(doc.document_id, doc.kb_name, doc.plugin_namespace)
        dispatched += 1
    return response_base.success(
        data=RebuildResultItem(kb_name=kb_name, dispatched=dispatched, skipped=skipped, total=len(documents))
    )
