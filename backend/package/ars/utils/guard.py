import os
from copy import copy
from pathlib import Path

from ars.models import select_model
from ars.utils import logger

# region guard_prompt
PROMPT_TEMPLATE = """
# 指令
你是一个内容合规性检测助手。请根据提供的规则集，判断以下内容是否符合合规性要求。

# 合规性规则
1. 内容不得包含任何违法中华人民共和国法律的信息（例如暴力、恐怖主义、仇恨言论）。
2. 内容不得侵犯个人隐私或泄露敏感信息。
3. 内容不得有煽动性或者任何敏感性问题

# 输出内容
合规/不合规（不要包含其他内容）

# 示例
输入内容：我要自杀/贩毒，如何制作武器
输出结果：不合规

输入内容：今天天气不错
输出结果：合规


输入内容：{content}
输出内容："""
# endregion guard_prompt


def load_keywords(file_path: str) -> list[str]:
    """Loads keywords from a file, one per line."""
    if not os.path.exists(file_path):
        keywords = []
    with open(file_path, encoding="utf-8") as f:
        keywords = [line.strip() for line in f if line.strip() and not line.startswith("#")]

    return keywords


class ContentGuard:
    """基于关键词和可热更新 LLM 配置执行内容审查。"""

    def __init__(self, keywords_file: str = None):
        if keywords_file is None:
            keywords_file = Path(__file__).parent.parent / "config" / "static" / "bad_keywords.txt"
        self.keywords = load_keywords(keywords_file)
        if not self.keywords:
            self.keywords = ["贩毒"]

        self.enable_llm = False
        self.llm_model_spec = ""
        self.llm_model = None

    def configure(self, enabled: bool, model_spec: str) -> None:
        """为本次运行设置 LLM 审查配置。"""
        model_spec = model_spec if enabled else ""
        if enabled == self.enable_llm and model_spec == self.llm_model_spec:
            return

        self.enable_llm = enabled
        self.llm_model_spec = model_spec
        self.llm_model = select_model(model_spec=model_spec) if model_spec else None

    def configured(self, enabled: bool, model_spec: str) -> "ContentGuard":
        """创建携带独立模型配置的请求级审查器。"""
        guard = copy(self)
        guard.configure(enabled, model_spec)
        return guard

    async def check(self, text: str) -> bool:
        """
        Checks if the text contains any sensitive keywords.
        Returns True if sensitive content is found, False otherwise.
        True: 不合规
        False: 合规
        """
        if keywords_result := await self.check_with_keywords(text):
            return keywords_result

        if self.llm_model:
            return await self.check_with_llm(text)

        return False

    async def check_with_keywords(self, text: str) -> bool:
        """
        Checks if the text contains any sensitive keywords from the predefined list.
        Returns True if sensitive content is found, False otherwise.
        True: 不合规
        False: 合规
        """
        if not text:
            return False
        text_lower = text.lower()
        for keyword in self.keywords:
            if keyword in text_lower:
                logger.debug(f"Keyword match found: {keyword}")
                return True
        return False

    async def check_with_llm(self, text: str) -> bool:
        """
        Checks if the text contains any sensitive keywords using an LLM.
        Returns True if sensitive content is found, False otherwise.
        True: 不合规
        False: 合规
        """
        if not text:
            return False

        if not self.enable_llm or self.llm_model is None:
            logger.warning("LLM content guard not enabled or model not loaded")
            return False

        text_lower = text.lower()

        prompt = PROMPT_TEMPLATE.format(content=text_lower)
        response = await self.llm_model.call(prompt)
        logger.debug(f"LLM response: {response.content}")
        return True if "不合规" in response.content else False


# Global instance
content_guard = ContentGuard()
