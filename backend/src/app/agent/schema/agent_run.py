"""Run 视图 DTO（agent 层设计 §4.1；③ 1.12：审计从「只写」变「可读」）。

只读快照：状态、用量、轨迹、错误。**不含 answer / result**——产物内容属于对话面
（§4.7 事件与重放），Run 面回答的是「这次跑得怎么样」，把正文塞进来会让一个审计
端点在列表轮询时搬动大量文本。``has_result`` 只告诉调用方「终态产物已就绪」。
"""

from __future__ import annotations

from datetime import datetime  # ruff: ignore[typing-only-standard-library-import]  # pydantic 需运行时解析字段类型

from pydantic import Field

from backend.src.common.schema import SchemaBase

__all__ = ['AgentRunCancelResult', 'AgentRunDetail']


class AgentRunDetail(SchemaBase):
    """一次 Run 的可读快照（``GET /runs/{run_id}``）。"""

    run_id: str = Field(description='运行 ID（UUID）')
    status: str = Field(description='八态：queued/running/waiting_ingest/interrupted/cancel_requested/终态')
    kb_names: list[str] = Field(default_factory=list, description='本次问答覆盖的知识库')
    plugin_namespace: str = Field('core', description='部署级域标识')
    query: str = Field('', description='原始问句（截断留存）')
    model_spec: str | None = Field(None, description='实际生效模型 spec')
    steps: list[dict] = Field(default_factory=list, description='过程轨迹（plan/act/grade/rewrite/generate）')
    tool_call_count: int = Field(0, description='内层工具循环调用次数')
    rewrite_count: int = Field(0, description='T3 自省改写次数')
    usage: dict = Field(default_factory=dict, description='token 用量')
    parent_run_id: str | None = Field(None, description='父 Run（中断后恢复起的新 Run 指向原 Run，D71）')
    error: str | None = Field(None, description='失败原因（人读）')
    error_code: str | None = Field(None, description='失败码（机器读）')
    has_result: bool = Field(False, description='终态产物是否已就绪（取消/超时也会落合成结果，D92）')
    created_time: datetime = Field(description='创建时间')
    updated_time: datetime | None = Field(None, description='最后流转时间（含心跳）')


class AgentRunCancelResult(SchemaBase):
    """取消结果（``POST /runs/{run_id}/cancel``）：取消是**幂等**的。"""

    run_id: str = Field(description='运行 ID')
    status: str = Field(description='取消后的状态：cancelled（已停）/ cancel_requested（已通知 worker 收敛）')
    accepted: bool = Field(description='本次调用是否真的改变了状态（false = 此前已终态，原样返回）')
