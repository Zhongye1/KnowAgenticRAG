from types import SimpleNamespace

from ars.agents.buildin.chatbot.prompt import PROMPT, build_prompt_with_context


def test_chatbot_prompt_does_not_duplicate_html_preview_skill_instructions():
    assert "html:preview" not in PROMPT


def test_chatbot_prompt_declares_workspace_visibility_and_default_write_boundary():
    prompt = build_prompt_with_context(
        SimpleNamespace(
            workdir_path="/home/gem/user-data/projects/11111111-1111-4111-8111-111111111111",
            system_prompt="",
        )
    )

    assert "可以读取其他 Project 目录作为参考" in prompt
    assert "未经用户明确要求，不得在当前 Project Workdir 之外" in prompt
    assert "/home/gem/user-data/agents/skills/" in prompt
