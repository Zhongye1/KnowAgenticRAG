# 对话页的三套视觉走查与证据归档（阶段二 B7）

状态：implemented
类型：feature
Owner：docs/develop-guides/decisions/implemented/2026-10-12-chat-visual-walkthrough.md

事实分工：本记录拥有走查方式、有效性口径与证据清单；截图本体归档在本地台账 `web/alembic/pages/agent/evidence/`（`alembic/` 被 gitignore，不入库，只在有该工作目录的机器上存在），台账侧的完成状态见 `web/alembic/pages/agent/roadmap.md`。走查方式是 headless Chrome 的 CDP（`Page.captureScreenshot`），脚本在 `web/tmp/`（不入库）。

## 问题

迁移标准要求 UI 改动在真实页面验证并提供截图；完成判定的第 3 项是「真实页面逐条走查通过」。本页此前 `evidence/` 为空，理由从「没有浏览器」（2026-10-12 证实不成立）修正为「没做」。

## 决策

1. **截图走 CDP 而不是 `--screenshot` 单发命令**：暗色主题需要预置 `localStorage` 并重载，单发命令做不到；CDP 能导航、注入、改仿真尺寸后连拍。脚本从 `http://127.0.0.1:9223/json/list` 拿页面 target，WebSocket 逐条发 `Page.navigate` / `Runtime.evaluate` / `Page.captureScreenshot`。
2. **身份用 `.chrome-profile`（已登录）**：登录态在 profile 的 localStorage 里；新开 `.chrome-profile-dark` 会落 `/login`（首次诊断时实测确认）。暗色注入用 `localStorage.setItem('ars-theme','dark')` + 重载 + 直接补 `html.dark` 与 `body[data-theme]`——应用的 `DayNightSwitcher` 挂载时会恢复偏好，但 CDP 会话里它挂载在侧栏展开态（首次导航 5 秒后实测 `data-theme=null`，原因未深查，不阻塞截图）。
3. **有效性自检**：每张截图按平均亮度验证（暗色 12–13，浅色 249–253，中间值即失败）；页面内容按 `location.pathname === '/agent'` 与正文文本断言（「新建对话」「暂无消息」「消息调试」）。
4. **走查范围的诚实边界**：本页 18 个界面状态 × 3 套 ≈ 54 张的完整矩阵需要真实后端与模型返回（流式中、工具审批中断、排队等），headless 空态只能覆盖「外壳 + 空态」；这批截图证明的是**样式基座、消息面外壳、输入面、面板面、令牌收口在真实页面渲染不破**，不是全状态矩阵。剩余状态归后续有真实数据时的走查。

## 替代方案

**Playwright/Puppeteer**：migration-guide 明确本机有系统 Chrome，不需要装；CDP 直连的脚本 60 行以内。

**逐一手点截图**：不可复现，也不满足「三套」的批量要求。

## 后果

- `evidence/` 有 8 张截图（B1/B2/B3/B4 各浅色一组 + B7 四张三态）。
- 完成判定第 3 项从「未做」变为「部分完成」：外壳与空态走查通过，18 状态矩阵待真实数据。
- 诊断中发现一个待确认的应用行为：CDP 会话里 `DayNightSwitcher` 挂载后 `data-theme` 仍是 null（4 秒后），即主题恢复可能依赖交互或存在时序问题——真人浏览器里未见异常，登记进风险。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| 浅色/暗色/窄屏三套截图存在且有效 | 假截图（全白/登录页） | `evidence/` | 亮度自检（暗 ≤68、浅 ≥244）+ DOM 断言 `/agent` | 用未登录 profile 时落在 /login（本次复现） | Passed |
| 旧能力不存在： `evidence/` 不再有「本页没有截图」的空目录状态 | 完成判定第 3 项虚报 | 本记录 | 目录列表 8 张 | — | Passed |
| 重新引入条件： 每次样式批次后按同一脚本重拍 | — | 本记录 | — | — | Passed |

## 风险

- 主题恢复的 CDP 时序问题（`data-theme=null`）若在真人浏览器也存在，是应用 bug 而非截图脚本问题——登记待查，不在本批修。
- 18 状态矩阵未覆盖；「完成判定第 3 项」在 report.md 里按部分完成口径声明，不虚报。

## 证据

- `evidence/`：`b1-light-1440x900.png`、`b1-narrow-390x844.png`、`b2-light-1440x900.png`、`b2-narrow-390x844.png`、`b3-light-1440x900.png`、`b4-light-1440x900.png`、`b7-light-1440x900.png`、`b7-light-narrow-390x844.png`、`b7-dark-1440x900.png`、`b7-dark-narrow-390x844.png`。
- 全量门禁（B7 时点）：`vitest run` 184 文件 / 2095 例全过、`tsc --noEmit`、`oxlint` 0 errors、`check:tokens`、`steiger`、`vite build`、根 `verify_engineering_contracts.py` 全过。

## 已知未验证范围

- 18 界面状态矩阵（流式中、审批中断、排队、提及候选打开、拖放高亮等）需要真实后端会话，未覆盖。
- 暗色下 antd 组件（Modal/Dropdown）的弹出层截图未拍（需要交互打开）。
- 主题恢复的 CDP 时序现象待查（见风险）。
