"""图谱域模型聚合导出（铁律 4：建表与模型注册依赖本模块的聚合导出）。"""

from backend.src.app.graph.model.entity import GraphEntity as GraphEntity
from backend.src.app.graph.model.mention import GraphDocumentIndex as GraphDocumentIndex
from backend.src.app.graph.model.mention import GraphMention as GraphMention
from backend.src.app.graph.model.triple import GraphTriple as GraphTriple

__all__ = ['GraphDocumentIndex', 'GraphEntity', 'GraphMention', 'GraphTriple']
