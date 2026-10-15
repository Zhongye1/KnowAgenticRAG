import pytest
from pydantic import ValidationError

from server.routers.chat_router import ThreadCreate, ThreadUpdate


def test_thread_create_rejects_legacy_direct_workdir_path():
    """新线程只能通过 project_id 选择 Workdir。"""
    with pytest.raises(ValidationError):
        ThreadCreate(agent_id="main", workdir_path="client/demo")


def test_thread_update_rejects_project_rebinding():
    """已有 Conversation 不接受 project_id 改绑。"""
    with pytest.raises(ValidationError):
        ThreadUpdate(project_id="project-2")
