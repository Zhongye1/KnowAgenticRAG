"""evaluation 域：RAG 检索与问答的质量度量（RAG 清单 Phase 4 / D61）。

依赖方向：``evaluation → {kb, retrieval, chat, model_provider}``（见 pyproject 的
import-linter 豁免）。评估要跑生成（Judge 与答案质量），所以必须能调 chat；
``retrieval → chat`` 是反向依赖，故评估不能塞进 retrieval 域，独立成域是唯一
不破契约的落点。
"""
