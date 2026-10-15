"""知识库运行时单例。"""

import os

from ars.config import get_runtime_dir
from ars.config.runtime import knowledge_capability_enabled
from ars.knowledge.factory import KnowledgeBaseFactory
from ars.knowledge.implementations.dify import DifyKB
from ars.knowledge.implementations.milvus import MilvusKB
from ars.knowledge.implementations.notion import NotionKB
from ars.knowledge.manager import KnowledgeBaseManager

if knowledge_capability_enabled():
    KnowledgeBaseFactory.register(MilvusKB)
KnowledgeBaseFactory.register(DifyKB)
KnowledgeBaseFactory.register(NotionKB)

knowledge_base = KnowledgeBaseManager(os.path.join(get_runtime_dir(), "knowledge_base_data"))
