from types import SimpleNamespace

import pytest

from ars.knowledge.eval import service as eval_service_module
from ars.knowledge.eval.service import EvaluationService, build_evaluation_run_name


class FakeEvaluationRepository:
    def __init__(self):
        self.created_dataset = None
        self.updated_dataset = None
        self.dataset = None
        self.created_run = None

    async def create_dataset(self, payload):
        self.created_dataset = payload

    async def update_dataset(self, dataset_id, payload):
        self.updated_dataset = (dataset_id, payload)

    async def get_dataset(self, dataset_id):
        return self.dataset

    async def create_run(self, payload):
        self.created_run = payload


class FakeChunkRepository:
    def __init__(self, indexed_count):
        self.indexed_count = indexed_count

    async def count_graph_indexed_by_kb_id(self, kb_id):
        return self.indexed_count


class FakeKnowledgeBaseRepository:
    async def get_by_kb_id(self, kb_id):
        return SimpleNamespace(query_params={"options": {"top_k": 3}})


@pytest.mark.asyncio
async def test_generate_dataset_saves_generation_params(monkeypatch):
    async def fake_enqueue(**kwargs):
        return SimpleNamespace(id="task_1")

    monkeypatch.setattr(eval_service_module.tasker, "enqueue", fake_enqueue)
    service = EvaluationService()
    service.eval_repo = FakeEvaluationRepository()
    service.chunk_repo = FakeChunkRepository(indexed_count=1)

    result = await service.generate_dataset(
        kb_id="db_1",
        name="dataset",
        description="desc",
        count=2,
        neighbors_count=3,
        concurrency_count=4,
        llm_model_spec="test:model",
        generation_mode="graph_enhanced",
        graph_expand_top_k=2,
        created_by="user_1",
    )

    assert result["task_id"] == "task_1"
    params = service.eval_repo.created_dataset["build_metadata"]["params"]
    assert params["generation_mode"] == "graph_enhanced"
    assert params["graph_expand_top_k"] == 2
    updated_metadata = service.eval_repo.updated_dataset[1]["build_metadata"]
    assert updated_metadata["params"] == params


@pytest.mark.asyncio
async def test_generate_dataset_rejects_graph_mode_without_indexed_chunks():
    service = EvaluationService()
    service.eval_repo = FakeEvaluationRepository()
    service.chunk_repo = FakeChunkRepository(indexed_count=0)

    with pytest.raises(ValueError, match="尚未完成图索引"):
        await service.generate_dataset(
            kb_id="db_1",
            name="dataset",
            description="desc",
            count=2,
            neighbors_count=3,
            concurrency_count=4,
            llm_model_spec="test:model",
            generation_mode="graph_enhanced",
            graph_expand_top_k=1,
            created_by="user_1",
        )

    assert service.eval_repo.created_dataset is None


def test_build_evaluation_run_name_uses_eval_date_hash_format():
    name = build_evaluation_run_name(hash_value="abcdef12")

    assert name.startswith("eval-")
    assert name.endswith("-abcdef")
    assert len(name.split("-")[1]) == 8


@pytest.mark.asyncio
async def test_run_evaluation_saves_custom_name(monkeypatch):
    async def fake_enqueue(**kwargs):
        return SimpleNamespace(id="task_1")

    monkeypatch.setattr(eval_service_module.tasker, "enqueue", fake_enqueue)
    repo = FakeEvaluationRepository()
    repo.dataset = SimpleNamespace(
        dataset_id="dataset_1",
        kb_id="db_1",
        name="dataset",
        item_count=2,
        build_metadata={"status": "completed"},
    )
    service = EvaluationService()
    service.eval_repo = repo
    service.kb_repo = FakeKnowledgeBaseRepository()

    run_id = await service.run_evaluation(
        kb_id="db_1",
        dataset_id="dataset_1",
        name="  回归评估  ",
        model_config={"answer_llm": "test:model"},
        created_by="user_1",
    )

    assert run_id.startswith("run_")
    assert repo.created_run["name"] == "回归评估"
    assert repo.created_run["retrieval_config"]["top_k"] == 3
    assert repo.created_run["retrieval_config"]["answer_llm"] == "test:model"
