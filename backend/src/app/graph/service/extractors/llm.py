"""LLM 图谱抽取器（RAG 清单 Phase 5 / D62：Yuxi ``extractors/llm.py`` 迁移）。

**与 Yuxi 的差异**：Yuxi 在 ``extract()`` 里用 ``select_model(...)`` 现取模型；这里改为
**构造期注入 chat 模型**。理由与评估域的 Judge 相同：抽取器是纯"文本 → 结构化结果"
的变换，模型从哪来不该混在里面；注入后单测可以用替身覆盖全部解析分支，不必打桩模型工厂。

保留 Yuxi 的一条约束：**不接受自定义完整 prompt**，只接受 ``schema`` 约束片段——完整
prompt 一旦可换，JSON 契约就跟着可换，而下游的 ``normalize_extraction_result`` 是按固定
形状校验的，放开等于把"格式错误"从早期挪到运行期。
"""

from __future__ import annotations

from typing import Any

import json_repair

from backend.src.app.graph.service.extractors.base import GraphExtractor

__all__ = ['DEFAULT_EXTRACTION_PROMPT', 'LLMGraphExtractor']

DEFAULT_EXTRACTION_PROMPT = """请从下面文本中抽取实体和实体关系，返回严格 JSON，不要输出解释。
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
    """用 chat 模型做结构化抽取（模型在构造期注入）。"""

    extractor_type = 'llm'

    def __init__(self, chat_model: Any, options: dict[str, Any] | None = None) -> None:
        super().__init__(options)
        if chat_model is None:
            raise ValueError('LLM 抽取器需要 chat_model')
        self._chat_model = chat_model

    def validate_options(self) -> None:
        if self.options.get('prompt'):
            raise ValueError('LLM 图谱抽取器不支持自定义完整 Prompt，请使用 schema 配置抽取约束')

    @staticmethod
    def build_prompt(text: str, *, schema: str = '') -> str:
        """构造抽取提示词；``schema`` 非空时追加为约束片段。"""
        prompt = DEFAULT_EXTRACTION_PROMPT
        constraint = str(schema or '').strip()
        if constraint:
            prompt = f'{prompt}\n{SCHEMA_INSTRUCTION.format(schema=constraint)}'
        return f'{prompt}\n\n文本：\n{text}'

    async def extract(self, text: str, *, chunk_metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        """单块文本 → 未归一结果；模型不可用/回复不可解析时抛（由调用方按块隔离）。"""
        self.validate_options()
        prompt = self.build_prompt(text, schema=str(self.options.get('schema') or ''))
        content, _usage = await self._chat_model.achat([{'role': 'user', 'content': prompt}])
        parsed = json_repair.loads(_strip_fence(str(content or '')))
        if not isinstance(parsed, dict):
            raise TypeError(f'抽取回复不是 JSON 对象: {str(content)[:120]}')
        return parsed


def _strip_fence(content: str) -> str:
    """剥掉模型惯用的 ```json 围栏（json_repair 修内容，但围栏要先去掉）。"""
    text = content.strip()
    if text.startswith('```'):
        text = text.split('\n', 1)[1] if '\n' in text else ''
        if text.rstrip().endswith('```'):
            text = text.rstrip()[:-3]
    return text.strip()
