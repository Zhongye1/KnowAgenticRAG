from __future__ import annotations

from typing import Any

import json_repair

from ars.models.chat import select_model

from .base import GraphExtractor

DEFAULT_TRIPLE_EXTRACTION_PROMPT = """请从下面文本中抽取实体和实体关系，返回严格 JSON，不要输出解释。
JSON 格式：
{
  "relations": [
    {
      "source": {"text": "实体文本", "label": "实体类型", "attributes": [{"text": "属性值", "label": "属性名称"}]},
      "target": {"text": "实体文本", "label": "实体类型", "attributes": [{"text": "属性值", "label": "属性名称"}]},
      "text": "关系显示文本",
      "label": "关系类型"
    }
  ]
}
"""

SCHEMA_INSTRUCTION = """抽取 Schema 约束：
{schema}
"""


class LLMGraphExtractor(GraphExtractor):
    extractor_type = "llm"

    def validate_options(self) -> None:
        if not self.options.get("model_spec"):
            raise ValueError("LLM 抽取器需要 model_spec")
        if self.options.get("prompt"):
            raise ValueError("LLM 图谱抽取器不支持自定义完整 Prompt，请使用 schema 配置抽取约束")
        concurrency_count = self.options.get("concurrency_count", 1)
        try:
            concurrency_count = int(concurrency_count)
        except (TypeError, ValueError) as exc:
            raise ValueError("LLM 抽取器 concurrency_count 必须是整数") from exc
        if concurrency_count < 1 or concurrency_count > 1000:
            raise ValueError("LLM 抽取器 concurrency_count 必须在 1 到 1000 之间")
        if self.options.get("model_params") is not None and not isinstance(self.options["model_params"], dict):
            raise ValueError("LLM 抽取器 model_params 必须是对象")

    async def extract(self, text: str, *, chunk_metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        self.validate_options()
        model = select_model(
            model_spec=self.options["model_spec"],
            timeout=60.0,
            model_params=self.options.get("model_params") or {},
        )
        prompt = self._build_prompt(text)
        response = await model.call(prompt, stream=False)
        parsed = json_repair.loads(response.content if response else "")
        return parsed

    def _build_prompt(self, text: str) -> str:
        extraction_prompt = DEFAULT_TRIPLE_EXTRACTION_PROMPT
        schema = str(self.options.get("schema") or "").strip()
        if schema:
            extraction_prompt = f"{extraction_prompt}\n{SCHEMA_INSTRUCTION.format(schema=schema)}"
        return f"{extraction_prompt}\n\n文本：\n{text}"
