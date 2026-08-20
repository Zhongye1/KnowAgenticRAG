from backend.src.common.schema import SchemaBase


class TaskRegisteredDetail(SchemaBase):
    name: str
    task: str
