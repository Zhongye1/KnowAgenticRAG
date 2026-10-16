from typing import Any, Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from server.utils.auth_middleware import get_admin_user
from server.utils.knowledge_permissions import (
    ensure_knowledge_base_permission,
    require_knowledge_base_manage,
    require_knowledge_base_read,
)
from ars.knowledge.eval.benchmark_generation import (
    DEFAULT_BENCHMARK_GENERATION_CONCURRENCY,
    MAX_BENCHMARK_GENERATION_CONCURRENCY,
)
from ars.knowledge.eval.service import EvaluationService
from ars.permissions import ResourcePermission
from ars.repositories.evaluation_repository import EvaluationRepository
from ars.storage.postgres.models_business import User
from ars.utils import logger


evaluation = APIRouter(prefix="/evaluation", tags=["evaluation"])


class GenerateDatasetRequest(BaseModel):
    name: str = Field(default="自动生成评估数据集", min_length=1, max_length=100)
    description: str = ""
    count: int = Field(default=10, ge=1, le=100)
    neighbors_count: int = Field(default=1, ge=0, le=10)
    concurrency_count: int = Field(
        default=DEFAULT_BENCHMARK_GENERATION_CONCURRENCY,
        ge=1,
        le=MAX_BENCHMARK_GENERATION_CONCURRENCY,
    )
    llm_model_spec: str = Field(..., min_length=1)
    generation_mode: Literal["vector", "graph_enhanced"] = "vector"
    graph_expand_top_k: int = Field(default=1, ge=1, le=3)


class RunEvaluationRequest(BaseModel):
    dataset_id: str = Field(..., min_length=1)
    name: str | None = Field(default=None, min_length=1, max_length=100)
    retrieval_config: dict[str, Any] = Field(default_factory=dict, alias="model_config")


class EvaluationDatasetItem(BaseModel):
    """评估数据集读模型；字段对齐 `EvaluationService._dataset_to_dict`。"""

    id: str
    dataset_id: str
    name: str
    description: str | None
    kb_id: str
    item_count: int
    has_gold_chunks: bool
    has_gold_answers: bool
    build_metadata: dict[str, Any]
    created_by: str | None
    created_at: str | None
    updated_at: str | None


class EvaluationDatasetQuestionItem(BaseModel):
    """数据集题目；字段对齐 `EvaluationService._dataset_item_to_dict`。"""

    item_id: str
    item_index: int
    query: str
    gold_chunk_ids: list[Any]
    gold_answer: str | None


class EvaluationDatasetPagination(BaseModel):
    """数据集详情分页信息。"""

    current_page: int
    page_size: int
    total_items: int
    total_pages: int
    has_next: bool
    has_prev: bool


class EvaluationDatasetDetailItem(EvaluationDatasetItem):
    """数据集详情：在摘要之上附带当页题目与分页。"""

    items: list[EvaluationDatasetQuestionItem]
    pagination: EvaluationDatasetPagination


class EvaluationGenerationItem(BaseModel):
    """数据集生成任务提交结果。"""

    dataset_id: str
    task_id: str
    message: str


class EvaluationResumeItem(BaseModel):
    """数据集生成恢复结果；已完成时不下发 `task_id`。"""

    dataset_id: str
    task_id: str | None = None
    message: str


class EvaluationRunItem(BaseModel):
    """评估运行历史条目；对齐 `EvaluationService.list_runs`。

    `progress`/`message` 仅在运行中任务存在时下发，路由用
    `response_model_exclude_unset=True` 保持逐键一致。
    """

    run_id: str
    name: str
    dataset_id: str | None
    status: str
    started_at: str | None
    completed_at: str | None
    total_items: int | None
    completed_items: int | None
    overall_score: float | None
    retrieval_config: dict[str, Any]
    metrics: dict[str, Any]
    progress: int | None = None
    message: str | None = None


class EvaluationRunResultPage(BaseModel):
    """逐题结果分页信息。"""

    current_page: int
    page_size: int
    total: int
    total_pages: int
    error_only: bool


class EvaluationRunResultItem(BaseModel):
    """逐题结果；字段对齐 `EvaluationService._run_item_to_dict`。"""

    query: str
    gold_chunk_ids: list[Any] | None
    gold_answer: str | None
    generated_answer: str | None
    retrieved_chunks: list[Any]
    metrics: dict[str, Any]


class EvaluationRunResultData(BaseModel):
    """评估运行结果；运行未落库时只回任务进度字段（`progress`/`message`）。"""

    run_id: str
    status: str
    name: str | None = None
    started_at: str | None = None
    completed_at: str | None = None
    total_items: int | None = None
    completed_items: int | None = None
    overall_score: float | None = None
    retrieval_config: dict[str, Any] | None = None
    items: list[EvaluationRunResultItem] | None = None
    pagination: EvaluationRunResultPage | None = None
    progress: int | None = None
    message: str | None = None


class EvaluationDatasetItemResponse(BaseModel):
    """数据集上传结果响应。"""

    message: str
    data: EvaluationDatasetItem


class EvaluationDatasetListResponse(BaseModel):
    """数据集列表响应。"""

    message: str
    data: list[EvaluationDatasetItem]


class EvaluationDatasetDetailResponse(BaseModel):
    """数据集详情响应。"""

    message: str
    data: EvaluationDatasetDetailItem


class EvaluationGenerationResponse(BaseModel):
    """数据集生成任务提交响应。"""

    message: str
    data: EvaluationGenerationItem


class EvaluationResumeResponse(BaseModel):
    """数据集生成恢复响应。"""

    message: str
    data: EvaluationResumeItem


class EvaluationRunCreateData(BaseModel):
    """评估运行创建结果。"""

    run_id: str


class EvaluationRunCreateResponse(BaseModel):
    """评估运行创建响应。"""

    message: str
    data: EvaluationRunCreateData


class EvaluationRunListResponse(BaseModel):
    """评估运行历史响应。"""

    message: str
    data: list[EvaluationRunItem]


class EvaluationRunResultResponse(BaseModel):
    """评估运行结果响应。"""

    message: str
    data: EvaluationRunResultData


class EvaluationDeleteResponse(BaseModel):
    """评估数据集/运行删除结果；`data` 固定为 null。"""

    message: str
    data: None


async def _get_evaluation_dataset_or_raise(dataset_id: str) -> Any:
    """加载评估数据集，不存在时返回统一的 404。"""

    dataset = await EvaluationRepository().get_dataset(dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="评估数据集不存在")
    return dataset


async def require_evaluation_dataset_read(
    dataset_id: str,
    current_user: User = Depends(get_admin_user),
) -> User:
    """校验管理员对评估数据集所属知识库的读取权限。"""

    dataset = await _get_evaluation_dataset_or_raise(dataset_id)
    await ensure_knowledge_base_permission(str(dataset.kb_id), current_user, ResourcePermission.READ)
    return current_user


async def require_evaluation_dataset_manage(
    dataset_id: str,
    current_user: User = Depends(get_admin_user),
) -> User:
    """校验管理员对评估数据集所属知识库的管理权限。"""

    dataset = await _get_evaluation_dataset_or_raise(dataset_id)
    await ensure_knowledge_base_permission(str(dataset.kb_id), current_user, ResourcePermission.MANAGE)
    return current_user


@evaluation.post(
    "/databases/{kb_id}/datasets/upload",
    response_model=EvaluationDatasetItemResponse,
    response_model_exclude_unset=True,
)
async def upload_evaluation_dataset(
    kb_id: str,
    file: UploadFile = File(...),
    name: str = Form(...),
    description: str = Form(""),
    current_user: User = Depends(require_knowledge_base_manage),
):
    """上传评估数据集"""
    try:
        if not file.filename.endswith(".jsonl"):
            raise HTTPException(status_code=400, detail="仅支持JSONL格式文件")

        service = EvaluationService()
        result = await service.upload_dataset(
            kb_id=kb_id,
            file_content=await file.read(),
            filename=file.filename,
            name=name,
            description=description,
            created_by=current_user.uid,
        )
        return {"message": "success", "data": result}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"上传评估数据集失败: {e}")
        raise HTTPException(status_code=500, detail=f"上传评估数据集失败: {str(e)}")


@evaluation.get(
    "/databases/{kb_id}/datasets",
    response_model=EvaluationDatasetListResponse,
    response_model_exclude_unset=True,
)
async def list_evaluation_datasets(
    kb_id: str,
    current_user: User = Depends(require_knowledge_base_read),
):
    """获取知识库的评估数据集列表"""
    try:
        service = EvaluationService()
        datasets = await service.list_datasets(kb_id)
        return {"message": "success", "data": datasets}
    except Exception as e:
        logger.exception(f"获取评估数据集列表失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取评估数据集列表失败: {str(e)}")


@evaluation.get(
    "/databases/{kb_id}/datasets/{dataset_id}",
    response_model=EvaluationDatasetDetailResponse,
    response_model_exclude_unset=True,
)
async def get_evaluation_dataset(
    kb_id: str,
    dataset_id: str,
    page: int = 1,
    page_size: int = 10,
    current_user: User = Depends(require_knowledge_base_read),
):
    """获取评估数据集详情"""
    try:
        if page < 1:
            raise HTTPException(status_code=400, detail="页码必须大于0")
        if page_size < 1 or page_size > 100:
            raise HTTPException(status_code=400, detail="每页大小必须在1-100之间")

        service = EvaluationService()
        dataset = await service.get_dataset_detail(kb_id, dataset_id, page, page_size)
        return {"message": "success", "data": dataset}
    except HTTPException:
        raise
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"获取评估数据集详情失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取评估数据集详情失败: {str(e)}")


@evaluation.get("/datasets/{dataset_id}/download", response_class=Response)
async def download_evaluation_dataset(
    dataset_id: str,
    current_user: User = Depends(require_evaluation_dataset_read),
):
    """导出评估数据集 JSONL"""
    try:
        service = EvaluationService()
        export_info = await service.export_dataset_jsonl(dataset_id)
        filename = export_info["filename"]
        return Response(
            content=export_info["content"].encode("utf-8"),
            media_type="application/x-ndjson",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
        )
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"导出评估数据集失败: {e}")
        raise HTTPException(status_code=500, detail=f"导出评估数据集失败: {str(e)}")


@evaluation.delete(
    "/datasets/{dataset_id}",
    response_model=EvaluationDeleteResponse,
    response_model_exclude_unset=True,
)
async def delete_evaluation_dataset(
    dataset_id: str,
    current_user: User = Depends(require_evaluation_dataset_manage),
):
    """删除评估数据集"""
    try:
        service = EvaluationService()
        await service.delete_dataset(dataset_id)
        return {"message": "success", "data": None}
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"删除评估数据集失败: {e}")
        raise HTTPException(status_code=500, detail=f"删除评估数据集失败: {str(e)}")


@evaluation.post(
    "/databases/{kb_id}/datasets/generate",
    response_model=EvaluationGenerationResponse,
    response_model_exclude_unset=True,
)
async def generate_evaluation_dataset(
    kb_id: str,
    request: GenerateDatasetRequest,
    current_user: User = Depends(require_knowledge_base_manage),
):
    """自动生成评估数据集"""
    try:
        service = EvaluationService()
        result = await service.generate_dataset(
            kb_id=kb_id,
            name=request.name,
            description=request.description,
            count=request.count,
            neighbors_count=request.neighbors_count,
            concurrency_count=request.concurrency_count,
            llm_model_spec=request.llm_model_spec,
            generation_mode=request.generation_mode,
            graph_expand_top_k=request.graph_expand_top_k,
            created_by=current_user.uid,
        )
        return {"message": "success", "data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"生成评估数据集失败: {e}")
        raise HTTPException(status_code=500, detail=f"生成评估数据集失败: {str(e)}")


@evaluation.post(
    "/databases/{kb_id}/datasets/{dataset_id}/resume",
    response_model=EvaluationResumeResponse,
    response_model_exclude_unset=True,
)
async def resume_evaluation_dataset(
    kb_id: str,
    dataset_id: str,
    current_user: User = Depends(require_knowledge_base_manage),
):
    """恢复自动生成评估数据集"""
    try:
        service = EvaluationService()
        result = await service.resume_dataset_generation(
            kb_id=kb_id, dataset_id=dataset_id, created_by=current_user.uid
        )
        return {"message": "success", "data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"恢复评估数据集生成失败: {e}")
        raise HTTPException(status_code=500, detail=f"恢复评估数据集生成失败: {str(e)}")


@evaluation.post(
    "/databases/{kb_id}/runs",
    response_model=EvaluationRunCreateResponse,
    response_model_exclude_unset=True,
)
async def run_evaluation(
    kb_id: str,
    request: RunEvaluationRequest,
    current_user: User = Depends(require_knowledge_base_manage),
):
    """运行RAG评估"""
    try:
        service = EvaluationService()
        run_id = await service.run_evaluation(
            kb_id=kb_id,
            dataset_id=request.dataset_id,
            name=request.name,
            model_config=request.retrieval_config,
            created_by=current_user.uid,
        )
        return {"message": "success", "data": {"run_id": run_id}}
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"启动评估失败: {e}")
        raise HTTPException(status_code=500, detail=f"启动评估失败: {str(e)}")


@evaluation.get(
    "/databases/{kb_id}/runs",
    response_model=EvaluationRunListResponse,
    response_model_exclude_unset=True,
)
async def list_evaluation_runs(
    kb_id: str,
    current_user: User = Depends(require_knowledge_base_read),
):
    """获取知识库评估运行历史"""
    try:
        service = EvaluationService()
        runs = await service.list_runs(kb_id)
        return {"message": "success", "data": runs}
    except Exception as e:
        logger.exception(f"获取评估运行历史失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取评估运行历史失败: {str(e)}")


@evaluation.get(
    "/databases/{kb_id}/runs/{run_id}",
    response_model=EvaluationRunResultResponse,
    response_model_exclude_unset=True,
)
async def get_evaluation_run_results(
    kb_id: str,
    run_id: str,
    page: int = 1,
    page_size: int = 20,
    error_only: bool = False,
    current_user: User = Depends(require_knowledge_base_read),
):
    """获取评估运行结果"""
    try:
        if page < 1:
            raise HTTPException(status_code=400, detail="页码必须大于0")
        if page_size < 1 or page_size > 100:
            raise HTTPException(status_code=400, detail="每页大小必须在1-100之间")

        service = EvaluationService()
        results = await service.get_run_results(kb_id, run_id, page=page, page_size=page_size, error_only=error_only)
        return {"message": "success", "data": results}
    except HTTPException:
        raise
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"获取评估运行结果失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取评估运行结果失败: {str(e)}")


@evaluation.delete(
    "/databases/{kb_id}/runs/{run_id}",
    response_model=EvaluationDeleteResponse,
    response_model_exclude_unset=True,
)
async def delete_evaluation_run(
    kb_id: str,
    run_id: str,
    current_user: User = Depends(require_knowledge_base_manage),
):
    """删除评估运行"""
    try:
        service = EvaluationService()
        await service.delete_run(kb_id, run_id)
        return {"message": "success", "data": None}
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"删除评估运行失败: {e}")
        raise HTTPException(status_code=500, detail=f"删除评估运行失败: {str(e)}")
