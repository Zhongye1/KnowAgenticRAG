项目为 Schema 进行了大量量身定制，详情看：`backend\src\common\schema.py`

## 类命名

遵循以下命名规范：

* 基础 schema: `XxxSchemaBase(SchemaBase)`
* 接口入参：`XxxParam()`
* 新增入参：`CreateXxxParam()`
* 更新入参：`UpdateXxxParam()`
* 批量删除入参：`DeleteXxxParam()`
* 查询详情：`GetXxxDetail()`
* 查询详情（join）：`GetXxxWithJoinDetail()`
* 查询详情（relationship）：`GetXxxWithRelationDetail()`
* 查询树：`GetXxxTree()`

## Field 定义

* 不建议将必填字段默认值设置为 `...`，参考：[必填字段](https://docs.pydantic.dev/latest/concepts/models/#required-fields)
* 建议为所有字段添加 `description` 参数，这对于 API 文档来说非常有用

## 驼峰返回

[**接口响应**](response.md#驼峰返回){.read-more}
