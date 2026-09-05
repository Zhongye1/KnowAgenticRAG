"""同步检索 API（ragf-design §7：POST /knowledge_bases/{kb_name}/search，M5）。

请求参数 = 单次覆盖层（D17）；响应走 fba ``ResponseSchemaModel`` 包装，
结果 payload 在 ``app/retrieval/schema`` 固化，作为未来跨服务契约（§14.12）。
"""

from typing import Annotated, cast

from fastapi import APIRouter, Path

from backend.src.app.kb.deps import CurrentNamespace
from backend.src.app.retrieval.schema.search_result import KBSearchOutput, KBSearchParam
from backend.src.app.retrieval.service.retrieval_service import retrieval_service
from backend.src.common.response.response_schema import ResponseSchemaModel, response_base
from backend.src.common.security.jwt import DependsJwtAuth
from backend.src.database.db import CurrentSession

router = APIRouter(dependencies=[DependsJwtAuth])


@router.post('/{kb_name}/search', summary='同步检索知识库（vector/hybrid + 可选精排）')
async def search_knowledge_base(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    kb_name: Annotated[str, Path(description='知识库标识', pattern=r'^[a-z0-9_]+$')],
    obj: KBSearchParam,
) -> ResponseSchemaModel[KBSearchOutput]:
    data = await retrieval_service.search(
        db,
        kb_name=kb_name,
        query_text=obj.query_text,
        param=obj,
        plugin_namespace=current_namespace,
    )
    return cast('ResponseSchemaModel[KBSearchOutput]', response_base.success(data=KBSearchOutput.model_validate(data)))
