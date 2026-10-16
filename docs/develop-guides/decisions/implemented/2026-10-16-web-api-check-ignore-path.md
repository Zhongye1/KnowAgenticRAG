# api:check 的生成物比对不再被 prettier 忽略清单吞掉

状态：implemented
类型：testing
Owner：web/scripts/api-check.mjs

## 问题

`pnpm run api:check` 在干净工作树上也报「契约生成物已漂移」，连 `core/types.gen.ts` 这类与契约无关的运行时文件都被判为内容不一致，因此这个门禁长期没有任何信号，`web/AGENTS.md` 里「`api:check` 在 CI 拦住漏生成」实际不成立。

根因在 `web/.prettierignore` 的裸模式 `tmp`：没有斜杠的模式会匹配任意层级的同名目录，而 `scripts/api-check.mjs` 把生成用的临时目录建在操作系统 `/tmp` 下，于是 prettier 对临时目录里的每个文件都判定为被忽略、静默不格式化。比对的一侧是格式化过的入库文件，另一侧是生成器的原始输出，差异全部是换行与缩进，被误报成契约漂移。

## 决策

`api-check.mjs` 在格式化临时目录时显式传 `--ignore-path` 指向一个紧邻临时目录的空忽略文件，让这一步只受 `--config` 与目标目录影响，不再继承仓库里为别的目的写的忽略清单（裸 `tmp`、`node_modules`、`dist` 等）。空忽略文件建在临时目录之外，避免它自己进入比对清单，并在 `finally` 中与临时目录一并删除。

没有改动 `web/.prettierignore` 的 `tmp`：那个模式的本意是忽略仓库内的本地临时目录，改成锚定的 `/tmp` 会连带影响仓库里其他 prettier 调用，收益不及风险。

## 替代方案

- 把 `web/.prettierignore` 的 `tmp` 改成锚定的 `/tmp`：修正了被误伤的路径，但会改变所有 prettier 调用的忽略范围，可能让此前被忽略的嵌套 `tmp` 目录突然进入格式检查。
- 把临时目录从系统 `/tmp` 挪到别处（例如用户主目录）：绕开同名目录，但依赖运行环境里某个可写目录存在，并把「为什么不能叫 tmp」这一隐含约束留在代码外。
- 让 `api:check` 比较前先自行格式化两侧：仍然改变比对语义，等于把「生成物必须是格式化后的样子」这条约束从生成步骤挪到校验步骤。
- 删掉 `api:check` 改由人工审阅快照：放弃 CI 拦截，回到漂移只能靠人发现的状态。

## 后果

`api:check` 从恒假变成恒真判据：它现在真的能拦住「改了契约或后端却没重新生成」。本次补齐响应模型后它报「契约生成物一致：17 个文件」，连续两次运行结果一致。

门禁依赖一份写在临时目录旁的空忽略文件，`finally` 负责清理；如果该文件残留，只会让下一次运行的格式化步骤多读一个空清单，不改变判定。

## 验证

- 修前实测：把 `web/src/shared/api/generated` 与 `web/openapi.json` stash 回 HEAD 后运行 `pnpm run api:check`，仍报 `content不一致：core/queryKeySerializer.gen.ts`、`core/serverSentEvents.gen.ts`、`core/types.gen.ts`、`core/utils.gen.ts`、`index.ts`、`sdk.gen.ts`、`types.gen.ts` 并退出 1，证明与本次改动无关。
- 根因直接证据：手工复现生成流程并把临时目录留在 `/tmp`，`diff` 显示差异是纯格式（`import type { A, B, C } from …` 未折行）；对同一目录追加 `--ignore-path /dev/null` 重新格式化后，`diff -rq` 与入库生成物完全一致。
- 修后：`pnpm run api:check` 输出「契约生成物一致：17 个文件」，退出码 0；连续两次运行结果相同。
