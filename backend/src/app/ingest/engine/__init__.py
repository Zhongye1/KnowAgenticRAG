"""摄取引擎适配层（双管线摄取 spec D1：EagleRAG 解析引擎的 RAG-F 侧封装）。

引擎 SDK 均为主依赖（knowhere-python-sdk / pixelrag / dashscope），模块顶层
直接导入；运行期错误由各引擎 fail-closed 异常表达。
"""
