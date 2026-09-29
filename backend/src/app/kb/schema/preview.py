"""预览 DTO（kb-落地改造清单 Phase 3 / D55）。"""

from pydantic import Field

from backend.src.common.schema import SchemaBase


class PreviewItem(SchemaBase):
    """文档预览描述（按 kind 取用其中一部分字段）

    字段语义按 ``kind`` 分流：

    - ``markdown`` / ``text``：读 ``content`` + ``offset``/``next_offset``/``total_bytes`` 续读；
    - ``image``：读 ``url``（预签名直连）；
    - ``pdf``：读 ``content_url``（Range 代理端点）+ ``total_bytes``/``page_count``；
    - ``office``：``status=converting`` 时轮询本接口；就绪后退化为 ``pdf``；
    - ``unsupported``：只给下载。

    ``degraded`` 为真表示走了降级梯（Office 转换失败 → 解析产物 Markdown），
    此时 ``kind`` 已被改写为 ``markdown``，``fallback_reason`` 说明原因。
    """

    document_id: str = Field(description='文档 ID')
    name: str = Field(description='文档名称')
    kind: str = Field(description='预览类别（markdown/image/text/pdf/office/unsupported）')
    status: str = Field(description='状态（ready/converting/failed/unsupported）')
    content_url: str | None = Field(None, description='Range 代理端点相对路径（pdf / office 就绪时）')
    url: str | None = Field(None, description='图片预签名直连 URL')
    content: str | None = Field(None, description='内联文本窗口内容（markdown / text）')
    offset: int = Field(0, description='本次窗口起始**字节**偏移')
    next_offset: int | None = Field(None, description='下一窗口起始字节偏移；null = 已到末尾')
    total_bytes: int | None = Field(None, description='对象总字节数')
    page_count: int | None = Field(None, description='PDF 页数（Office 产物由转换容器给出）')
    degraded: bool = Field(False, description='是否走了降级梯（转换失败 → 解析产物）')
    fallback_reason: str | None = Field(None, description='降级原因（degraded=true 时有值）')


class BatchDocumentParam(SchemaBase):
    """批量操作参数（逐条处理，不整批回滚）"""

    document_ids: list[str] = Field(min_length=1, max_length=200, description='文档 ID 列表（≤200）')


class BatchItemResult(SchemaBase):
    """批量操作的逐条结果"""

    document_id: str = Field(description='文档 ID')
    ok: bool = Field(description='该条是否成功')
    detail: str | None = Field(None, description='失败原因或成功补充说明')


class BatchResult(SchemaBase):
    """批量操作汇总（部分成功不回滚整批）"""

    total: int = Field(description='请求条数')
    succeeded: int = Field(description='成功条数')
    failed: int = Field(description='失败条数')
    items: list[BatchItemResult] = Field(default_factory=list, description='逐条结果')
