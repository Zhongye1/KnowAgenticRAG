"""Run 提交快照：提交进程与执行进程之间**唯一**的交接面（agent 层设计 §2.1 / D66）。

Run 迁进 Celery worker 后，「提交」与「执行」不再是同一个进程、也不再共享内存：
HTTP 协程里能拿到的一切（请求体、``request.user``、已求值的 ACL），worker 都拿不到。
所以执行所需的全部输入必须在提交时**快照落行**（``agent_runs.payload``），worker
只按 ``run_id`` 重建——这也是「Celery 只做投递、事实源在 PG」这条分工的必然结果。

快照里放什么、不放什么：

- **放**：知识库名、``AgentParam`` 全量、用户身份（uid / 部门 / 角色）；
- **不放**：已求值的 ``Scope``。ACL 是**易变**的（提交到执行之间可能被撤权），
  快照身份信息、在执行时用 ``build_retrieval_scope`` 重新求值，才是 fail-closed
  的方向——存 Scope 等于给一个可能已失效的授权做缓存。

用户身份里只带 ``dept_id`` 与 ``roles``，不带 ``is_superuser`` 之类的权限位：
权限求值仍统一走 kb 域的 resolver（D45 default deny），本模块不做第二套授权判断。
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from backend.src.app.agent.schema.agent import AgentParam
from backend.src.app.kb.service.acl.scope import UserContext

__all__ = ['RunPayload', 'build_run_payload', 'parse_run_payload']


@dataclass(frozen=True)
class RunPayload:
    """快照的强类型视图（worker 侧读到的就是这些）。"""

    kb_name: str
    param: AgentParam
    user: UserContext | None
    namespace: str | None = None

    @property
    def query(self) -> str:
        """入库时截断前的原始问句（``AgentParam.query_text``）。"""
        return str(self.param.query_text or '')


def build_run_payload(
    *,
    kb_name: str,
    param: AgentParam,
    user: UserContext | None = None,
    namespace: str | None = None,
) -> dict[str, Any]:
    """构造提交快照（纯函数，便于单测与 API 层复用）。

    ``model_dump(mode='json')`` 是刻意的：快照要进 JSON 列，枚举/日期在这里就归一，
    避免 worker 侧读到非 JSON 原生类型。
    """
    return {
        'kb_name': str(kb_name),
        'namespace': str(namespace if namespace is not None else (user.namespace if user else '')) or None,
        'param': param.model_dump(mode='json'),
        'user': _dump_user(user),
    }


def _dump_user(user: UserContext | None) -> dict[str, Any] | None:
    """用户身份 → 可 JSON 化的最小集合（None 表示无身份执行，如内部调用）。"""
    if user is None:
        return None
    return {
        'user_id': str(user.user_id or ''),
        'namespace': str(user.namespace or ''),
        'dept_id': user.dept_id,
        'roles': [str(item) for item in (user.roles or [])],
    }


def parse_run_payload(payload: Mapping[str, Any] | None) -> RunPayload:
    """快照 → 强类型视图；结构缺失即 ``ValueError``（调用方转失败态，不静默降级）。

    这里**不做容错**：快照是服务端自己写的，字段缺失说明提交路径有 bug，
    继续执行只会用默认值跑出一个语义错误的 Run。
    """
    data = dict(payload or {})
    kb_name = str(data.get('kb_name') or '')
    if not kb_name:
        raise ValueError('Run 快照缺少 kb_name')
    raw_param = data.get('param')
    if not isinstance(raw_param, Mapping):
        raise TypeError('Run 快照的 param 必须是对象')
    raw_user = data.get('user')
    user: UserContext | None = None
    if isinstance(raw_user, Mapping):
        user = UserContext(
            user_id=str(raw_user.get('user_id') or ''),
            namespace=str(raw_user.get('namespace') or ''),
            dept_id=raw_user.get('dept_id'),
            roles=[str(item) for item in (raw_user.get('roles') or [])],
        )
    namespace = data.get('namespace')
    return RunPayload(
        kb_name=kb_name,
        param=AgentParam.model_validate(dict(raw_param)),
        user=user,
        namespace=str(namespace) if namespace else None,
    )
