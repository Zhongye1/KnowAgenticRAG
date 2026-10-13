# 对话页的模型选择

状态：implemented
类型：feature
Owner：web/src/pages/chat/ui/chat-page.tsx

事实分工：`web/src/features/chat/lib/model-spec.ts` 拥有当前模型的回退链与展示文本；`web/src/features/chat/api/model-api.ts` 拥有模型列表端点，`api/system-config-api.ts` 与 `model/system-config.ts` 拥有系统配置（默认模型与默认 OCR 引擎）；`web/src/features/chat/model/model-selection.ts` 拥有按会话的覆盖表与两条查询；`web/src/features/chat/model/thread-list-store.ts` 拥有把这次下发的模型记进本地会话 metadata；`web/src/features/chat/model/chat-runtime.ts` 拥有 `model_spec` 的传递；`web/src/features/chat/ui/model-selector.tsx` 拥有选择器外观；`web/src/pages/chat/ui/chat-page.tsx` 拥有入口与编排。

## 问题

参照在输入区右侧放了一个模型选择器（`ModelSelectorComponent.vue`，657 行），当前模型由四级回退决定：

1. 组件内按会话记的覆盖（草稿态用一个固定键）；
2. 会话 `metadata.model_spec`；
3. 智能体配置里的 `model`；
4. 系统配置的 `default_model`。

发送时每次请求都下发 `model_spec`，后端在创建 run 的同一事务里把它绑定到会话；参照随后把这次下发的 spec 写回本地会话对象并清掉覆盖。覆盖只存在组件内存里，刷新后回到第 2 级。

本仓 `sendMessage` 没有 `modelSpec` 参数，页面也没有入口；`createRun` 早已接受 `model_spec`。

## 决策

**四级回退抽成纯函数**：`resolveModelSpec` 落 `lib/model-spec.ts`，输入是覆盖值、会话 metadata、智能体配置与系统默认值；空串与纯空白都按「没有选择」处理。触发按钮的短名由 `formatModelSpecLabel` 给出，与参照的 `displayName: 'mini'` 同值（取 `provider:model` 里模型名的最后一段）。

**模型列表在 chat 切片自己的 api 段取**：调契约生成物的 `/models/v2`（`model_type: 'chat'`），归一成按供应商分组的稳定结构：缺 `spec` 的模型、没有可用模型的组都丢掉，归一后重复的供应商与重复的 `spec` 也去掉——它们会成为渲染时的重复 key。与 `features/knowledge-base` 处理同一个端点的方式一致，不扩大 `features/model-providers` 的公开面。

**覆盖按会话记、不落 localStorage**：草稿态用一个固定键，新建会话成功后把草稿键挪到新会话 id 上；无论目标会话有没有选择，草稿键一律清掉（它是「还没建会话」的临时位，会话一建出来就不再成立）。

**发送时下发 `model_spec`，并把这次下发的值写回本地会话 metadata**：`ChatRuntime.sendMessage` 增加可选的 `modelSpec`，透传给 `createRun`；引导与普通发送共用同一条路径，因此两条都带上。写回由 `thread-list-store` 的 `setModelSpec` 完成，它只改本地对象——持久化由后端拥有。不写回的话，用户随后点「默认」会回退到一个还没刷新的旧值，显示与下发的都不是后端已经绑定的那个模型，下一次发送还会把绑定改写掉。

**不清理发送后的覆盖**：参照在发送成功后删掉覆盖，本仓保留。`sendMessage` 要到整段流结束才返回，清理只能在提交时做，而提交可能失败；保留覆盖在用户可见结果上与参照等价（写回之后第 1 级与第 2 级是同一个值），且不依赖成败判定。

**不做候选搜索、连通性检查与缓存刷新**：本仓的对话模型列表目前只有个位数，搜索的收益要在列表变长之后才出现；后两者是供应商管理面的能力，本仓已有 `useTestModelStatus` 与 `refreshModelCache`，对话页不重复提供。

## 替代方案

**把模型选择做成会话级设置项**（写 `PUT /api/chat/thread/{id}`）：与参照不一致，且后端已经按「创建 run 的同一事务里绑定」设计，前端再写一次会多出一个事实源。

**不写回本地会话 metadata，靠清空时重新拉列表**：多一次网络往返，且清空是一个同步动作，等列表回来之前界面仍然是错的。

**复用 `features/model-providers` 的查询**：该切片目前不导出模型列表查询，只有 `useModelProviders` 与 `useDefaultModelSpec`；为对话页加公开导出会扩大管理面的查询面，跨切片依赖也不合分层。

**覆盖落 localStorage**：参照没有。覆盖的语义是「这条会话临时用这个模型」，持久化会让用户在别处看到一条并不存在的偏好，而真正的绑定由后端持有。

## 后果

- 模型列表与系统默认模型是两条独立查询：后者属于管理面，普通用户可能读不到；它失败时只表示「没有系统默认」，不会把模型列表一起带失败。
- 写回发生在提交时而不是后端确认之后：发送被拒绝时本地会留下一条后端并未绑定的 spec。用户可见结果仍然一致（覆盖还在，界面显示的就是他选的那个），下一次成功发送会把它真正绑上。
- 后端把请求的 spec 归一成了别的模型时，界面在刷新前显示的是用户请求的那个。参照同样如此。
- 选择器只有一级下拉加分组标题，没有搜索框；模型列表变长后需要补，这一点记在台账的组 C 里。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 当前结果 |
|---|---|---|---|---|
| 四级回退按参照的顺序取值 | 有覆盖时仍下发默认模型，或会话绑定被忽略 | `lib/model-spec.ts` | `test/unit/features/chat/model-spec.test.ts`（8 例：顺序、空串、空白、展示名） | Passed |
| 选中的模型随请求下发 | 选了模型但请求里没有 `model_spec` | `model/chat-runtime.ts` | `test/unit/features/chat/queue-runtime.test.ts` 的「把 model_spec 透传给创建请求」与「不传 modelSpec 时不下发模型」 | Passed |
| 选中的模型被后端绑定到会话并用于本次运行 | 只改了界面，后端仍用默认模型 | `pages/chat/ui/chat-page.tsx` | 真实链路：headless Chrome 在 `/agent` 打开选择器选中 `zai-org/GLM-5.2` 并发送，回读会话列表得到 `metadata.model_spec = "siliconflow-cn:zai-org/GLM-5.2"`，该 run 的 `input_payload.model_spec` 与 `manifest.model.spec` 同值；触发按钮显示 `GLM-5.2` | Passed |
| 没有显式选择时下发会话绑定的模型 | 会话绑定被忽略 | 同 | `test/unit/pages/chat-page.test.tsx` 的「没有显式选择时下发会话绑定的模型」 | Passed |
| 发送成功后本地会话对象记下这次下发的模型 | 清空选择后掉回默认值，下一次发送把后端绑定改写掉 | `model/thread-list-store.ts` | `test/unit/features/chat/thread-list-store.test.ts` 的 `setModelSpec` 两例，加页面用例「本地会话还没有绑定值时，发送后清空选择仍然回到刚下发的模型」 | Passed |
| 清空选择回到会话绑定 | 清空后仍下发上一次的 spec | `pages/chat/ui/chat-page.tsx` | 同文件的「清空选择后回到会话绑定的模型」 | Passed |
| 从选择器选一个模型会写进覆盖表 | 选了但状态没落 | `ui/model-selector.tsx`、`model/model-selection.ts` | `test/unit/features/chat/model-selector.test.tsx`（6 例）与页面用例「从选择器选一个模型会写进覆盖表」 | Passed |
| 新建会话时草稿态的选择被带过去，草稿键清掉 | 新建会话后选择丢失，或草稿键残留 | `model/model-selection.ts` | `test/unit/features/chat/model-selection.test.ts` 的提升两例与页面用例「新建会话时把草稿态选的模型带过去」 | Passed |
| 模型列表归一 | 缺 `spec` 的模型进了列表，或重复项造成重复 key | `api/model-api.ts` | 同文件的 `normalizeChatModels` 五例（含去重） | Passed |
| 守卫的负向案例能失败 | 守卫被删后测试仍然全绿 | 上述文件 | 八处「改坏 → 用例失败 → 还原」并核对 md5，基线 140 例：回退去掉会话绑定那一级（4 例失败）、展示名不取最后一段（2 例）、`sendMessage` 不透传 `model_spec`（1 例）、页面不下发 `modelSpec`（7 例）、不写回本地 metadata（1 例）、草稿选择不提升（1 例）、归一不去重（1 例）、store 写回改成空操作（1 例） | Passed |
| 全量门禁 | — | — | `oxlint`（322 文件 0/0）、`tsc`、`check-design-tokens.mjs`、`steiger`、`depcruise`（369 模块 / 1330 依赖）、`vitest`（164 文件 / 1868 例）、`vite build` | Passed |

已知未验证范围：三套视觉走查（浅色 / 暗色 / 窄屏）与截图归档未做，本批只做了浅色 1440×900 的功能核对；候选搜索、连通性检查与缓存刷新按上面的取舍不做；模型列表很大时的表现未验证；后端把请求的 spec 归一成别的模型时界面在刷新前显示请求值，这一差异未处理。
