# 测试规范与工作流

本文档用于指导 ARS 后续如何创建测试文件、修改测试文件，以及如何验证项目功能。目标是务实、稳定、可执行，不追求过度设计。

## 1. 测试分层

当前测试统一分为三层：

- `backend/test/unit`
  - 纯单元测试
  - 不依赖运行中的 Docker 服务
  - 优先使用 `monkeypatch`、fake repo、stub、`tmp_path`

- `backend/test/integration`
  - 真实服务集成测试
  - 依赖 `docker compose up -d` 后的运行环境
  - API 行为通过真实 HTTP 验证；事务、锁、schema、lease 等基础设施语义直接在真实 PostgreSQL / Redis 边界验证

- `backend/test/e2e`
  - 关键链路端到端测试
  - 覆盖 run、viewer、附件、文件落盘等完整流程
  - 默认数量少、执行更慢
  - PR 阻断优先使用无外部密钥的 deterministic assembled-path；真实 provider/browser 作为手工或周期探针

其他子项目约定：

- 前端单元测试统一放在 `web/test/unit`，通过 `pnpm test:unit` 运行（镜像 `web/src` 的目录结构）。
  该套件在 `web/vite.config.ts` 里把 `maxWorkers` 限到 50%：默认按 CPU 数铺满时，靠
  `userEvent` 驱动的交互用例会成片假失败；个别重交互文件（表格、评估面板、调试弹窗）用文件级
  `vi.setConfig({ testTimeout: 15000 })` 自带预算，不放宽全局配置。
- `packages/ars-cli` 是独立 Python 包，沿用 Python 社区惯例放在 `packages/ars-cli/tests`。
- 同一个子项目内不要同时创建 `test` 和 `tests` 两个测试根目录。

## 2. 新增测试时怎么选目录

新增测试前先判断：

1. 只测 Python 逻辑，不需要真实服务
   放到 `unit`

2. 需要请求真实接口
   放到 `integration/api`

3. 需要验证从入口到最终结果的完整链路
   放到 `e2e`

不要再默认把测试直接丢到 `backend/test/` 根目录。

## 3. 文件和命名规范

文件名：

- 使用 `test_<domain>_<target>.py`
- 一个文件只测一个明确主题

函数名：

- 使用 `test_<行为>_<预期结果>`
- 名称直接表达业务语义

示例：

- `test_create_agent_run_commits_before_enqueue`
- `test_viewer_download_returns_attachment_response`
- `test_agent_bubble_sort_run_creates_expected_artifacts`

## 4. 写测试的基本要求

每个测试尽量保持三段式：

1. Arrange：准备数据、打桩、创建资源
2. Act：调用被测行为
3. Assert：断言结果

要求：

- 不要只断言 `status_code == 200`
- 要断言关键业务字段和副作用
- 失败信息要能帮助定位问题
- 每个新 guard 至少有一个负向案例：恢复目标缺陷后，测试必须在正确原因上失败
- fixture、snapshot 与 expected output 不能由同一个 CI 步骤一边生成一边验收；更新必须显式进入 diff

高风险测试必须贴近语义 Owner，并能从自然语言主张追踪到 oracle、负向案例和实际选择它的 workflow。`scripts/verify_engineering_contracts.py --report` 只从当前代码、测试、decision 与 workflow 派生临时审计视图；它不维护中央清单，也不能替代测试语义 Review。

## 5. fixture 规范

原则：

- 同一个文件内复用，优先写本地 helper
- 多个文件复用，再提取到对应层级的 `conftest.py`
- 根 `backend/test/conftest.py` 只保留通用 marker，不绑定真实环境

当前约定：

- `backend/test/integration/conftest.py`
  - 管理 `test_client`、`admin_headers`、`standard_user`、`knowledge_database`

- `backend/test/e2e/conftest.py`
  - 管理 `e2e_client`、`e2e_headers`、`e2e_agent_context`

## 6. 允许与禁止

允许：

- 在单元测试里使用 `monkeypatch`
- 在集成测试里通过 fixture 创建测试资源
- 在 E2E 中使用轮询等待最终状态

禁止：

- 在测试文件里硬编码真实账号密码
- 在单元测试里请求真实 HTTP 服务
- 在根 `conftest.py` 里继续添加重环境依赖
- 写 `if __name__ == "__main__":` 作为测试入口
- 用 `print` 作为通过/失败判断手段
- 因为系统里没有默认数据就直接 `skip`

## 7. skip 的使用规则

只在下面两类场景允许 `pytest.skip`：

1. 外部可选能力不可用
   例如 OCR 服务、外部模型服务未启动

2. E2E 环境变量未配置
   例如没有配置专用测试账号

不允许把“系统里没有 agent / config / 预置数据”当成正常 skip 条件。
这类情况应优先改为 fixture 显式准备资源，或者直接 fail 暴露环境问题。

## 8. 修改测试文件时的规则

如果是修 bug：

1. 先补一个能稳定复现 bug 的测试
2. 再修代码
3. 先跑最小相关测试集
4. 再跑相关层级回归

如果是改已有功能：

- 行为变了，就更新断言
- 文件职责混乱，就顺手拆分或迁移目录
- 依赖现成系统状态的测试，优先改成 fixture 建资源

## 9. 运行方式

启动环境：

```bash
docker compose up -d
docker ps
docker logs api-dev --tail 100
```

运行单元测试：

```bash
docker compose exec api uv run --group test pytest test/unit -m "not slow"
```

运行集成测试：

```bash
docker compose exec api uv run --group test pytest test/integration
```

运行 E2E：

```bash
docker compose exec api uv run --group test pytest test/e2e -m e2e
```

PR 的确定性 assembled-path 由 `system-tests.yml` 自动执行；需要仓库 `SILICONFLOW_API_KEY` secret 的真实 provider 校准通过 GitHub Actions 的 `Real Provider Agent Probe` 手工启动。探针缺少凭证会明确失败，不以 skip 冒充通过。

运行全部测试：

```bash
docker compose exec api uv run --group test pytest test
```

也可以使用：

```bash
backend/test/run_tests.sh unit
backend/test/run_tests.sh integration
backend/test/run_tests.sh e2e
backend/test/run_tests.sh all
```

运行前端单元测试：

```bash
docker compose exec web pnpm run lint:check
docker compose exec web pnpm run test:unit
docker compose exec web pnpm run build
```

运行工程信任与文档 gate：

```bash
python3 scripts/verify_engineering_contracts.py
python3 -m unittest scripts.test_verify_engineering_contracts
cd docs && pnpm run build
```

运行依赖供应链审计：

```bash
make audit-dependencies
make audit-licenses
```

漏洞审计覆盖 `backend/uv.lock`、`packages/ars-cli/uv.lock`、`web/pnpm-lock.yaml` 与 `docs/pnpm-lock.yaml` 的生产传递闭包，并执行 `scripts/dependency-audit-fixtures/` 中的固定脆弱输入证明 gate 会失败。backend 锁定的 PyTorch 2.12.1 wheel 要求 `setuptools<82`，且当前 CPU index 没有兼容的 2.13 版本组合；对应 advisory 通过 `uv audit --ignore` 明确列在 workflow 与 Makefile 中，依赖约束解除后直接删除。许可证步骤在临时隔离环境中使用 `pip-licenses` 输出 backend 和 ars-cli 的传递依赖报告，不修改项目 `.venv`，仅提供 Review 线索，不自动判断许可证兼容性，也不维护允许清单。

Windows 初始化安全契约由原生 PowerShell 负控执行；Windows 或安装了 PowerShell 7 的环境可运行：

```powershell
pwsh -NoProfile -File scripts/test_init_security.ps1
```

Backend workflow 会在 `windows-latest` 上阻断短值、密钥复用和首尾空白；不以 Bash 结果代替 PowerShell 语法与执行语义。

## 10. 推荐的日常开发流程

建议顺序：

1. 本地改代码
2. 先跑相关单元测试
3. 涉及接口时跑相关集成测试
4. 涉及关键主链路时补跑对应 E2E
5. 提交前至少完成“契约检查 -> 测试 -> 只读 Lint / build”

## 11. 当前落地原则

这套规范采用渐进落地方式：

- 新增测试必须按新目录落位
- 改到旧测试时顺手迁移
- 优先保持测试可执行和可信
- 优先减少假绿和环境耦合

CI 的 backend unit selector 固定执行 `test/unit -m "not slow"`，不能改回依赖可遗漏 marker 的 `-m unit`。Integration、deterministic E2E 与真实 provider 探针按风险和环境能力分开：deterministic E2E 必须经过 shipping Compose、API、worker、SSE 和最终持久化事实，不得在进程内 monkeypatch；真实 provider 未执行时必须在 PR 中记为 `Not run`，不能由 replay、unit、HTTP 200 或日志关键词代替。

对当前 ARS 来说，这就是最务实、也最容易持续执行的测试标准。
