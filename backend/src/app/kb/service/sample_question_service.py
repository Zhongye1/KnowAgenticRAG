"""示例问题服务（kb-落地改造清单 Phase 4 / 4.1）。

KB 级元数据供给：示例问题给前端引导与 Agent 规划参考。**不新增存储**——用
`knowledge_bases.sample_questions` JSON 列（整字段替换语义，示例问题是策展内容，
逐条增删反而难用）。导图见 `mindmap_service.py`。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from backend.src.app.kb.crud import knowledge_base_dao
from backend.src.common.exception import errors

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

__all__ = ['MAX_SAMPLE_QUESTIONS', 'MAX_SAMPLE_QUESTION_CHARS', 'SampleQuestionService', 'normalize_questions']

MAX_SAMPLE_QUESTIONS = 20
MAX_SAMPLE_QUESTION_CHARS = 200


def normalize_questions(questions: list[Any]) -> list[str]:
    """清洗示例问题：去空、去首尾空白、按序去重、截断单条长度、限总量。

    纯函数：单测直覆盖。清洗放在服务层而非 Schema，是因为 Schema 的 `max_length`
    只挡总量，挡不住空串与重复。

    入参类型是 `list[Any]` 而非 `list[str]`：来源是 JSON 列，历史数据或人工改库
    都可能混入非字符串，这里必须容忍而不是让整个接口 500。
    """
    seen: set[str] = set()
    cleaned: list[str] = []
    for raw in questions or []:
        text = str(raw or '').strip()[:MAX_SAMPLE_QUESTION_CHARS]
        if not text or text in seen:
            continue
        seen.add(text)
        cleaned.append(text)
        if len(cleaned) >= MAX_SAMPLE_QUESTIONS:
            break
    return cleaned


class SampleQuestionService:
    """示例问题读写（整字段替换语义）。"""

    @staticmethod
    async def list_questions(*, db: AsyncSession, kb_name: str) -> list[str]:
        kb = await knowledge_base_dao.get(db, kb_name)
        if kb is None:
            raise errors.NotFoundError(msg='知识库不存在')
        return list(kb.sample_questions or [])

    @staticmethod
    async def replace_questions(*, db: AsyncSession, kb_name: str, questions: list[str]) -> list[str]:
        """整字段替换（不是增量）：示例问题是策展内容，逐条增删反而难用。"""
        kb = await knowledge_base_dao.get(db, kb_name)
        if kb is None:
            raise errors.NotFoundError(msg='知识库不存在')
        cleaned = normalize_questions(questions)
        kb.sample_questions = cleaned
        await db.flush()
        return cleaned


sample_question_service = SampleQuestionService()
