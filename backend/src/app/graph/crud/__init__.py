"""图谱域 CRUD 聚合导出。"""

from backend.src.app.graph.crud.crud_graph import CRUDGraph as CRUDGraph
from backend.src.app.graph.crud.crud_graph import graph_dao as graph_dao

__all__ = ['CRUDGraph', 'graph_dao']
