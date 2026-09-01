"""标签目录 API（scope filter 数据源）。"""

from typing import Annotated

from fastapi import APIRouter, Query

from backend.src.app.kb.deps import CurrentNamespace
from backend.src.app.kb.schema.tag import TagItem
from backend.src.app.kb.service.tag_service import tag_service
from backend.src.common.response.response_schema import ResponseSchemaModel, response_base
from backend.src.common.security.jwt import DependsJwtAuth
from backend.src.database.db import CurrentSession

router = APIRouter()


@router.get('/tags', summary='标签目录', dependencies=[DependsJwtAuth])
async def get_tags(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    limit: Annotated[int, Query(ge=1, le=500, description='数量上限')] = 100,
) -> ResponseSchemaModel[list[TagItem]]:
    data = await tag_service.list_tags(db=db, limit=limit)
    return response_base.success(data=[TagItem.model_validate(item) for item in data])
