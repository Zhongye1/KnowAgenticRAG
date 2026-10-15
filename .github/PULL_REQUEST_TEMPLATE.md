<!--
Agent 创建 PR 时使用本默认模板。
非 Agent 提交可使用 .github/PULL_REQUEST_TEMPLATE/non-agent.md 简化模板。
-->

## 变更说明

请说明本 PR 解决的问题、主要改动及影响范围。

- 任务类型：`feature` / `bug-fix` / `simplification` / `architecture` / `process` / `testing`
- 目标与非目标：
- substantial / trivial 判断：

## 工程主张与 Owner

- 受影响的工程主张：请用自然语言逐条说明本 PR 改变或依赖的外部结果、状态或边界；不使用中央 claim ID。
- Owner / commit point / 观察边界：请说明事实由哪段代码、数据约束或契约拥有，何时提交、何处可观察。
- 决策记录：请链接新增或更新的 decision record；trivial 变更请说明为何免除。

## 验证情况

每条验收主张单独一组，字段与决策记录的证据矩阵一致（主张、失败面、语义 Owner、证据、负向案例、结果）。结果词只使用 `Passed`、`Inspected`、`Not run`、`Inferred`；除 `Passed` 外不得写成测试通过。不适用的字段写「不适用」，不要留空。

### <验收主张>

- 失败面：
- 语义 Owner：
- 直接证据 / 命令：
- 负向案例：
- 结果：<Passed / Inspected / Not run / Inferred>

涉及 Run、FIFO、SSE、沙盒、恢复或其他高风险 assembled path 时，请附 deterministic E2E 结果；真实 provider/browser 未执行时明确写 `Not run` 和风险。

## 简化 / 删除验收

仅 `simplification` 必填：说明 keep/narrow/replace/remove 的取舍；列出 consumer、registration/export、配置/manifest、durable/wire/migration、测试、文档和依赖的负向搜索；写明“旧能力不存在”的证据与重新引入条件。其他类型填“不涉及”。

## 独立语义 Review

请记录全新上下文 Reviewer 实际覆盖的需求、完整 diff 与测试范围、结论和未解决项；不粘贴推理流水账。Review 结论不能替代验证证据。

## 未验证范围与风险

请明确列出未执行的检查、无法复现的环境、外部 provider/浏览器/部署差异，以及对应风险。不要把未执行写成已通过。

## 事故反馈

若本变更修复达到门槛的高影响逃逸缺陷，请链接 postmortem 及已落地的 reproducer/guard/gate；未达到门槛请说明原因。

## 界面变更

如涉及界面或交互调整，请提供截图或录屏；不涉及请填写“不涉及”。

## 关联事项

如有关联 Issue，请填写 `Closes #<issue-number>` 或相关链接；无关联事项请填写“无”。

## 补充说明

请说明兼容性、配置、数据迁移或其他需要评审者关注的内容；无补充说明请填写“无”。
