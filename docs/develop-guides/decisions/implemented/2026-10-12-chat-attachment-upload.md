# 对话页的附件上传

状态：implemented
类型：feature
Owner：web/src/features/chat/model/attachment-upload.ts

事实分工：`web/src/features/chat/lib/attachment-upload.ts` 拥有校验、解析方式默认值、条目状态、确认载荷与「哪些附件还没被用掉」；`web/src/features/chat/api/attachments-api.ts` 拥有上传 / 解析 / 确认 / 列出四个端点与归一；`web/src/features/chat/model/attachment-upload.ts` 拥有条目列表、会话附件查询与操作；`web/src/features/chat/ui/attachment-upload.tsx` 拥有弹窗；`web/src/features/chat/model/chat-runtime.ts` 拥有附件 id 随请求下发与受理回调；`web/src/pages/chat/ui/chat-page.tsx` 拥有入口、建线程编排与缓存写入。

## 问题

参照的输入区有一个「添加附件」入口，点开 `AttachmentTmpUploadModal.vue`（470 行）走三步：上传到临时区、可选解析、确认到会话；还没有会话时先建一条（`ensureThread`）。

后端的事实：`POST /api/chat/attachments/tmp` 收 multipart 的 `file`，响应给 `{file_name, file_type, file_size, object_name, uploaded_at, parse_supported, parse_methods}`；PDF 给 `('disable', *OCR 引擎)`，图片给 `OCR 引擎`（不含 `disable`），其余格式给空数组；单文件上限 5 MB（`MAX_ATTACHMENT_SIZE_BYTES`）；`POST /tmp/parse` 给 `parsed_object_name`；`POST /thread/{id}/attachments/confirm` 收 `{attachments: [{file_type, object_name, parsed_object_name}]}`。

关键约束：**附件是单次使用的**。后端只在请求的 `meta.attachment_file_ids` 里收到 id 时才把它们绑到该请求上（`bind_attachments_to_request`），绑过之后附件记录带上 `request_id`，再绑一次会被 422 拒绝。所以「确认到会话」只是把文件挂到会话上，真正让模型看到它的是**发送时带上这批 id**。

本仓原本只有附件**展示**（`lib/message-attachments.ts` 归一消息里的附件），输入区只支持单张图片。

## 决策

**纯逻辑落 `lib/attachment-upload.ts`**：单文件上限校验（5 MB，与后端同值）、`getDefaultParseMethod`（配置值 → `rapid_ocr` → 第一个可选项；配置成 `disable` 且可选项里有它时取 `disable`）、条目状态判定（在途 / 可确认 / 能否确认）、确认载荷构造、临时上传响应与会话附件列表的归一、`pendingAttachmentFileIds`（只取还没有 `request_id` 的）。

**四个端点落 chat 切片的 api 段**，响应没有声明模型，字段按不可信数据处理；解析结果缺少对象名时抛错——那等于没解析成功，不能当成可确认的解析态。

**条目列表与操作落 `model/attachment-upload.ts`**：一个 hook 持有列表，暴露 `addFiles` / `parse` / `setParseMethod` / `remove` / `reset` / `confirm`。选中的文件先把条目全部列出来再并发上传（与参照一致）：用户选了三个文件就该立刻看到三条，而不是等第一条传完才出现第二条。上传与解析的错误分别落在该条目的 `error` / `parseError` 上；换解析方式会丢掉上一次的解析结果并把状态退回「已上传」。

**附件随请求下发，受理后刷新列表**：`sendMessage` 增加 `attachmentFileIds`（放进 `meta.attachment_file_ids`，空数组时不带这个字段）与 `onAccepted`。页面在发送时带上还没被用掉的附件 id，并在受理后重新拉会话附件——不刷新的话，下一次发送会把已经用掉的 id 再发一遍，被后端以「已被使用」拒绝。没有这一步，确认过的附件永远不会进模型上下文。

**确认后把结果写进查询缓存**：会话附件列表在新会话里还没拉回来，不写缓存的话用户紧接着发的第一条消息会漏掉刚挂上的附件。

**确认前先准备好会话**：`ensureThreadForAttachments` 在没有会话时建一条，并且沿用发送路径那套守卫（`creatingThread` 防重、`contextRef` 校验页面还在同一条新会话上）——没有守卫的话，建线程期间用户切走会被 `navigate` 拉回来，或者同时出现两条会话。

**解析与确认期间锁住会改变这一批内容的控件**：解析中换解析方式会让旧引擎的结果盖住新选择，确认期间改内容会让发出去的不是用户看到的。参照同样在 `parsing` / `confirming` 时禁用这些控件。

**弹窗落 `ui/attachment-upload.tsx`**：多选文件、逐条显示状态与解析方式、可移除、可确认；关闭即清空（与参照一致）。

**默认 OCR 引擎与默认模型合并成一条系统配置查询**：两者都读 `/api/system/config`；这次把端点提到 `api/system-config-api.ts`、把两个取值提到 `model/system-config.ts`，避免同一个端点出现第二个查询。

**不复制参照的提及候选菜单**：`AttachmentOptionsComponent` 里还有一份按类型分组的提及候选菜单，本仓的 `@` 弹窗已经提供同一个能力。

## 替代方案

**把附件并进现有的单张图片槽**：图片槽是「随消息下发的裸 base64」，附件是「先落到对象存储、确认后绑到会话、发送时按 id 挂上」的另一套；合并会让一条消息既带 base64 又带对象引用。

**确认即视为已被模型看到**：后端的绑定发生在请求创建时，只确认不发消息的话附件永远不会进上下文。

**把条目列表做成全局 store**：它只在弹窗打开期间存在，关闭即清空，没有跨页面消费者。

## 后果

- 客户端只校验大小，格式由后端决定；后端的拒绝文案会原样显示在弹窗里。
- 关闭弹窗即清空：用户误关就丢了已上传的条目。参照如此。清空之后，在途上传的响应落在已清空的列表上，不会把条目复活。
- 解析路径依赖后端可用的处理器：本机对 txt 的 `parse_methods` 是空数组，解析控件不出现。
- 参照的拖拽区与 `initialFiles`（外部把文件交给弹窗）没有做：本仓没有第二个入口会往弹窗里塞文件，拖拽区在阶段二做样式时一起补。
- 解析成功没有单独提示：结果直接体现在条目状态上。
- 附件绑定到请求之后，消息气泡不额外显示它；展示侧读的是会话附件列表。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 当前结果 |
|---|---|---|---|---|
| 超过 5 MB 的文件在本地就被拒绝 | 传上去等后端报错，用户白等 | `lib/attachment-upload.ts` | `test/unit/features/chat/attachment-upload.test.ts` 的 `validateAttachmentFile`（含恰好等于上限） | Passed |
| 解析方式的默认值按参照的优先级取 | 选了不该用的引擎，或该禁用时没禁用 | 同 | 同文件的 `getDefaultParseMethod` 六例（含「配置值优先于 `rapid_ocr` 兜底」） | Passed |
| 上传与解析失败只影响那一条 | 一条失败把整批状态弄乱 | `model/attachment-upload.ts` | `test/unit/features/chat/attachment-upload-hook.test.ts` 的「一条失败不影响另一条」与解析失败那例 | Passed |
| 多选时条目立刻全部出现 | 选了三个文件却要等第一条传完才看到第二条 | 同 | 同文件的「多选时条目立刻全部出现，再各自完成」 | Passed |
| 清空后在途上传的结果不会复活条目 | 取消后重开弹窗又冒出「已取消」的条目 | 同 | 同文件的「清空后在途上传的结果不会再回到列表里」 | Passed |
| 有在途条目或没有可确认条目时不能确认 | 半成品被确认到会话上 | `lib/attachment-upload.ts` | 同文件的 `canConfirm` 四例 | Passed |
| 确认载荷只带已上传 / 已解析的条目 | 把失败或解析中的条目也发出去 | 同 | 同文件的 `toConfirmPayload`（两条目对象名不同，用第一条填满两条不能通过） | Passed |
| 换解析方式会丢掉上一次的解析结果 | 界面显示的是上一次方式的解析结果 | `model/attachment-upload.ts` | hook 用例的「换解析方式会丢掉上一次的解析结果并退回「已上传」」 | Passed |
| 解析中与确认中锁住会改变这一批内容的控件 | 解析中改方式后旧结果仍被确认，或确认期间内容被改动 | `ui/attachment-upload.tsx` | `test/unit/features/chat/attachment-upload-dialog.test.tsx` 的「解析中锁住解析方式与解析按钮」与「确认期间锁住选择文件、移除与解析方式」 | Passed |
| 待下发的附件只取还没被用掉的 | 把已经绑到旧请求上的附件再发一次，被后端 422 拒绝 | `lib/attachment-upload.ts` | 同文件的 `pendingAttachmentFileIds` 两例 | Passed |
| 附件 id 随请求下发 | 确认了附件但模型看不到 | `model/chat-runtime.ts` | `test/unit/features/chat/queue-runtime.test.ts` 的「把会话附件 id 放进请求的 meta，并在受理后回调」与「没有附件时不带 `attachment_file_ids`」 | Passed |
| 受理后刷新会话附件 | 下一次发送重发已经用掉的 id | `pages/chat/ui/chat-page.tsx` | `test/unit/pages/chat-page.test.tsx` 的「发送时带上还没被用掉的附件 id」（并断言 `onAccepted` 触发刷新） | Passed |
| 确认后把结果写进缓存 | 刚挂上附件就发消息，那条消息漏掉它 | 同 | 同文件的「确认附件后把结果写进缓存，紧接着发的那条消息才带得上」 | Passed |
| 还没有会话时先建一条再确认 | 附件挂不上，或挂到别的会话 | 同 | 同文件的「有会话时确认附件直接挂到该会话上」与「没有会话时确认附件会先建一条会话」 | Passed |
| 真实链路：附件确认后随发送绑到请求上 | 只改了界面，后端没有这条附件或没有绑上 | 契约 `/api/chat/thread/{id}/attachments` 与 `meta.attachment_file_ids` | 真实链路：headless Chrome 在 `/agent` 点「附件」、用 CDP 给文件输入设一个 txt、点「添加」后跳进新会话，再输入一句话点「发送」；回读该会话附件得到 `file_name = probe-attachment.txt`、`status = uploaded`、`request_id = web-1791805835060-6bpfy7n9`（本次发送的客户端请求 id），即后端把它绑到了这条请求上；`limits.max_size_bytes = 5242880` 与客户端常量同值；核对后删掉了附件与会话 | Passed |
| 守卫的负向案例能失败 | 守卫被删后测试仍然全绿 | 上述文件 | 十三处「改坏 → 用例失败 → 还原」并核对 md5，基线 139 例：不校验大小（2 例失败）、解析方式优先级调换（1 例）、`canConfirm` 不看在途（1 例）、确认载荷不过滤状态（2 例）、待下发附件不过滤已用掉的（1 例）、上传失败清空整批（2 例）、换解析方式不退回「已上传」（1 例）、改回逐条等待上传（4 例）、发送不带附件 id（1 例）、受理后不回调（1 例）、解析中不禁用解析方式（2 例）、确认后不写缓存（1 例）、确认前不建会话（1 例） | Passed |
| 全量门禁 | — | — | `oxlint`（332 文件 0/0）、`tsc`、`check-design-tokens.mjs`、`steiger`、`depcruise`（379 模块 / 1368 依赖）、`vitest`（171 文件 / 1960 例）、`vite build` | Passed |

已知未验证范围：解析（OCR）路径只有单测覆盖——本机没有可解析的样本，txt 的 `parse_methods` 是空数组，真实链路只走了不支持解析的那条；三套视觉走查（浅色 / 暗色 / 窄屏）与截图归档未做，本批只做了浅色 1440×900 的功能核对；真实链路验证到「附件被绑到本次请求」，没有进一步核对模型回答里是否引用了文件内容。
