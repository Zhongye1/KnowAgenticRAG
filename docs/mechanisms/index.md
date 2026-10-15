# 机制详解

本模块供已完成[快速开始](../intro/quick-start.md)的贡献者和运维人员查询 ARS 运行机制。每页从组件关系开始，随后说明装配链、状态归属、权限、失败语义及源码入口；事实依据来自当前源码、配置、数据约束和测试。

## 模块边界

机制页用于查询运行原理。产品任务从 `intro/` 开始，环境变量、部署步骤和故障处理从 `advanced/` 开始，Agent、工具、Skills 与 SubAgent 开发从 `agents/` 开始。本模块集中回答组件链路、状态归属、读写边界和失败恢复问题。

仓库根 `ARCHITECTURE.md` 保存全仓稳定代码地图，本模块分别解释具体运行主题。设计取舍见[工程决策记录](../develop-guides/decisions/README.md)，测试层级和命令见[测试规范](../develop-guides/testing-guidelines.md)。机制页通过链接连接这些 Owner，不复制完整规则。

## 推荐阅读路径

1. [沙盒与文件系统](./sandbox.md)：Agent 的执行位置，以及线程、用户、Skills 和虚拟路径形成的隔离范围。
2. [Summary 上下文压缩](./context-compression.md)：长对话进入模型前的 L1 临时视图、L2 摘要和历史文件。
3. [知识库](./knowledge-base.md)：文档上传、解析、入库、检索及 Agent Skill 激活形成的 RAG 数据链路。

三页均按“入口 → 装配或派发 → 执行 Owner → 持久化或文件 → 可观察结果”展开。首次阅读可查看全景图和状态表；排障可进入“失败与观察边界”；修改实现可从“源码定位与验证”进入对应模块和测试。

## 专题地图

| 专题 | 核心问题 | 配置或操作入口 |
|---|---|---|
| [沙盒与文件系统](./sandbox.md) | sandbox identity、provisioner、挂载、路径权限、生命周期和代理边界 | [沙盒配置与运维](../agents/sandbox-architecture.md) |
| [Summary 上下文压缩](./context-compression.md) | 入口阈值、L1/L2、历史 offload、state event、流事件与 token 口径 | [中间件系统](../agents/middleware.md)与[智能体配置](../agents/agents-config.md) |
| [知识库](./knowledge-base.md) | 文件状态机、Silo/PostgreSQL/Milvus Owner、Tasker、Agent 可见性与工具激活 | [知识库入门](../intro/knowledge-base.md)与[文档处理/OCR](../advanced/document-processing.md) |

后续机制页只在主题有稳定 Owner、真实 consumer 和可验证主链路时新增。不要为了覆盖目录而逐文件生成页面；缺少当前证据的未来设计进入 roadmap 或 proposed decision。
