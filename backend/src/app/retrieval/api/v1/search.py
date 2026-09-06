"""同步检索 API（ragf-design §7：POST /knowledge_bases/{kb_name}/search，M5）。

请求参数 = 单次覆盖层（D17）；响应走 fba ``ResponseSchemaModel`` 包装，
结果 payload 在 ``app/retrieval/schema`` 固化，作为未来跨服务契约（§14.12）。

ACL：每轮查询服务端构建 Scope（用户组展开 + KB 级 ACL 求交），下推到 Milvus
召回内部过滤（agent-layer spec §4/§5）。
"""

from typing import Annotated, cast

from fastapi import APIRouter, Depends, Path

from backend.src.app.kb.deps import CurrentNamespace, CurrentScope
from backend.src.app.kb.utils.permissions import RAG_KB_SEARCH
from backend.src.app.retrieval.schema.search_result import KBSearchOutput, KBSearchParam
from backend.src.app.retrieval.service.retrieval_service import retrieval_service
from backend.src.common.response.response_schema import ResponseSchemaModel, response_base
from backend.src.common.security.jwt import DependsJwtAuth
from backend.src.common.security.permission import RequestPermission
from backend.src.common.security.rbac import DependsRBAC
from backend.src.database.db import CurrentSession

router = APIRouter(
    dependencies=[DependsJwtAuth, Depends(RequestPermission(RAG_KB_SEARCH)), DependsRBAC]
)


@router.post('/{kb_name}/search', summary='同步检索知识库（vector/hybrid + 可选精排）')
async def search_knowledge_base(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    scope: CurrentScope,
    kb_name: Annotated[str, Path(description='知识库标识', pattern=r'^[a-z0-9_]+$')],
    obj: KBSearchParam,
) -> ResponseSchemaModel[KBSearchOutput]:
    data = await retrieval_service.search(
        db,
        kb_name=kb_name,
        query_text=obj.query_text,
        param=obj,
        plugin_namespace=current_namespace,
        scope=scope,
    )
    return cast('ResponseSchemaModel[KBSearchOutput]', response_base.success(data=KBSearchOutput.model_validate(data)))
