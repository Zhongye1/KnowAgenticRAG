# 加载行的容器不再是 `<p>`：块级 `Spin` 不能塞进段落

状态：implemented
类型：bug-fix
Owner：web/AGENTS.md

事实分工：本决定拥有 `web/AGENTS.md` `边界` 一节的「加载行容器」约定，以及由此产生的 27 处改动；antd `Spin` 与仓内 `shared/ui/spinner` 的取舍仍归 [shared/ui 收口到 antd 终态](./2026-10-13-shared-ui-antd-endstate.md)，`web/src` 的分层与依赖边界仍归 `web/ARCHITECTURE.md`。

## 问题

`web/src` 下有 27 处「块级 `Spin` + 文案」的加载行写成 `<p className="flex items-center gap-2 …">`。antd `Spin` 渲染的根元素是 `div`，而 `<p>` 的 content model 只允许短语内容，于是这些行一渲染就触发 React 的 DOM 嵌套告警：

```
In HTML, <div> cannot be a descendant of <p>. This will cause a hydration error.
<p> cannot contain a nested <div>.
```

报告的入口是知识库文件表（`kb_p3m2ssdam8` 的文件管理页，加载行就在工具栏与表格之间），但同一写法分布在 23 个文件里，覆盖知识库六个标签页与技能、工具、MCP、模型供应商、智能体等面板：只要对应数据处于 pending，控制台就多两条告警。`Spin` 之外没有别的块级组件落在 `<p>` 里（全仓扫描），所以这就是这一类缺陷的全部。

这些 `<p>` 只贡献了一件事：antd `reset.css` 的 `p { margin-bottom: 1em }`。布局（`flex items-center gap-2`、`py-*`、`text-*`）全部来自工具类；「图标 + 状态文案」这个组合也没有消费者需要段落语义。

## 决策

1. 27 处的容器由 `<p>` 改为 `<div>`，类名逐字保留；`Spin`、文案、相邻结构一律不动，因此每个改动点是两行（开标签与闭标签）。
2. 不保留被替换掉的 `margin-bottom: 1em`：它是 reset 的默认值而不是本处的设计。在「加载提示与内容同时挂载」的场景（如文件表的 `showingStaleRows`）里，它让下方内容在加载期间多下移 12–14px、加载结束后再跳回；去掉它同时消掉这个跳动。
3. 加载行继续用 antd `Spin`，不换成仓内 `shared/ui/spinner`（理由见替代方案）。
4. 在 `web/AGENTS.md` 的 `边界` 补一条约定，让这个容器选择有明确的语义 Owner。
5. 不另开 proposal：本变更没有待裁决的取舍——唯一真实替代（换成仓内 `Spinner`）由 [shared/ui 收口到 antd 终态](./2026-10-13-shared-ui-antd-endstate.md) 的既定事实决定，其余是同一处的机械替换。

## 替代方案

**把 27 处的 `Spin` 换成仓内 `shared/ui/spinner`**：`Spinner` 渲染 `<output>`（短语内容，塞进 `<p>` 合法），改动同样是一行/处，且完全不触碰容器与布局。不采用的原因是与当前词汇漂移相反：`shared/ui/spinner` 只剩 5 个使用点（应用外壳、路由守卫、知识库页、共享配置表单），而 antd `Spin` 有 54 个文件在用；[shared/ui 收口到 antd 终态](./2026-10-13-shared-ui-antd-endstate.md) 已把「`spinner` 保留、不替换成 antd `Spin`，两者外观差异是已知的未闭合项」记为当前事实，把 27 处再改回自绘实现会把这个差异从 2 处放大到 29 处，是视觉回归而不是修 bug。

**只修用户报告的那一处**：控制台告警消失，但其余 26 处在各自页面 pending 时照旧报错。同一根因的 27 个实例不该只修一个。

**把 `<p>` 换成 `<span>` 并保留 `Spin`**：`<span>` 的 content model 同样是短语内容，`div` 仍然是非法子节点，只是 React 不校验 `span`。用它只是让校验器闭嘴，HTML 依旧非法。

**保留 `mb-[1em]` 让像素完全不变**：把 reset 的默认外边距化石到 27 个 `div` 上，读者无法从代码判断这个值从哪来，属于把偶然值固化成约定。

## 后果

- 23 个文件、27 处容器改为 `div`；`Spin`、文案与类名不变，`web/src` 下不再有「块级元素位于 `<p>` 内」的写法。
- 加载行的下外边距由 1em 变为 0：加载期间它与其后内容之间少 12–14px，文件表在「保留旧行 + 加载提示」并存的场景里少一次位移。这是本次唯一的视觉变化，已在真实页面（`127.0.0.1:5174`）确认加载行本身的外观、位置与表格布局正常。
- 仍存在的风险：`<p>` 内嵌 `div` 没有任何静态门禁可拦（oxlint 1.86 的规则集里没有 DOM 嵌套校验，React 只在开发构建里告警），复发只能靠运行期告警或代码审查发现。本记录只把当前 27 处清零，并把约定写进 `web/AGENTS.md`。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| `web/src` 下不再有块级组件位于 `<p>` 内 | 只改被报告的那一处 | 23 个组件文件 | 全仓扫描「`<p>` 段落体内出现 `<Spin`/`<div`」：0 处（改前 27 处） | 把 `knowledge-file-table.tsx` 的容器改回 `<p>` 后扫描立刻命中该处 | Passed |
| 真实页面不再产生嵌套告警 | 告警只在开发构建出现，prod 静默 | `features/knowledge-base/ui/files/table/knowledge-file-table.tsx` | 在 `127.0.0.1:5174` 注入 `console.error` 钩子，进入 `kb_p3m2ssdam8` 文件管理页并切筛选触发加载行：0 条告警，`document.querySelectorAll('p .ant-spin')` = 0；知识库六个标签页与技能/工具/MCP 视图同样为 0 | 同一页把容器改回 `<p>`（HMR）再触发加载行，钩子收到 `In HTML, <div> cannot be a descendant of <p>` 与 `<p> cannot contain a nested <div>` | Passed |
| 回归用例在正确原因上失败 | 原用例只断言加载文案存在 | `web/test/unit/features/knowledge-base/knowledge-file-table.test.tsx` | `pnpm exec vitest run test/unit/features/knowledge-base/knowledge-file-table.test.tsx`：67 通过 | 把容器改回 `<p>` 后跑**同一个整文件命令**：新增用例失败在 `expected <p …><div …></div></p> to be null`（1 failed / 66 passed） | Passed |
| 全量单测与静态门禁不退化 | 容器标签变化破坏既有断言 | `web/package.json` | `pnpm run test:unit`（235 文件 / 2540 例全过）、`check-types`、`check:tokens`、`lint:fsd`、`arch:check`、`api:check`、`build` 全过；`lint:check` 0 error / 31 warning，警告位置集合与改前逐条相同（把 23 个改动文件备份后 `git checkout --` 到改前版本再跑一次，30 个位置 `diff` 为空，随后按 sha256 校验还原） | — | Passed |
| 旧能力不存在： 把块级 `Spin` 放进 `<p>` 的加载行写法 | 半套写法共存 | 本记录 | 上表第一条的扫描结果 + `web/AGENTS.md` 的容器约定 | — | Passed |
| 重新引入条件： 出现真的需要段落语义的加载行（例如长文案段落里内联一个旋转图标）时，改用短语内容的实现（仓内 `Spinner`），而不是把块级组件塞回 `<p>` | 无条件回退 | 本记录 | — | — | Passed |

回归用例断言的是结构（加载行里没有 `<p>` 祖先、`p .ant-spin` 为空），不是 `console.error` 里有没有那条告警，也不锁定容器标签：React 按「父标签|子标签」在模块级对嵌套告警去重（`react-dom-client.development.js` 的 `didWarn`），同一文件里更早的用例已经渲染过同样的嵌套并消费掉 `div|p` 这一条，于是靠告警的用例只在 `-t` 单跑时失败、整文件跑时静默通过——一条只在隔离运行下才失败的 guard 不算 guard。
