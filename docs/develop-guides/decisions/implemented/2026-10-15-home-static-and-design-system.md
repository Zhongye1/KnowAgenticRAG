# 首页静态化 + 一套设计系统

状态：implemented
类型：simplification
Owner：web/src/pages/home/ui/home-page.tsx

## 问题

首页是纯展示页，但按「先健康检查、后加载配置」组织：整页被一次健康检查挡在门外，
失败进错误态、成功才渲染；展示数据里还留着已删段落的 api 段。样式侧同样没有收敛：

1. **色值不分层**。`home.css` 里有 43 个硬编码色值：5 个近乎同色的表面（`#fff` /
   `#f7f8f3` / `#fdfcf9` / `#f6f5f0` / `#f5f2ed`，两两亮度差 <3%，眼睛分不出来）、
   3 个线色、4 档灰、2 个强调色。两个强调色的名字与角色不符：`--accent-cyan` 是深蓝
   `#0b2a6f`，`--accent-gold` 是赭石 `#855811`。
2. **版面模型每个段落各写一份**。容器串
   `mx-auto w-full max-w-[1720px] px-[var(--content-gutter)] max-[721px]:px-[clamp(...)]`
   重复 5 份；竖向节奏 4 套公式（`py-125px`、`clamp(64,6vw,96)`、`clamp(72,7vw,112)`、
   `100/150`）；`--content-gutter` 是 `clamp(36px,11vw,220px)`，1280 视口下左右各吃掉
   140px，hero 文案实际只拿到 508px（宣称 `max-w-[850px]`）。
3. **段落级的真实缺陷**：
   - 集成段是 3 轨网格却只有 2 个子元素，最宽的 `1.6fr` 轨道空着，中间列被挤到 235px；
   - 任务链的卡片是 `<button>` 且没有重置，用的是 UA 灰底 + 2px 边框；
   - hero 的指针光斑被 Tailwind `min-[721px]:hidden` 在宽屏隐藏，而 effect 只在宽屏跑
     ——两边正好反了，宽屏不可见、窄屏静止；
   - hero「查看接口」指向 `#endpoint`，该元素早已不存在；
   - `.matrix-grid.is-hovered` 的悬停态在 JSX 去掉组件状态后失效。

## 决策

1. **页面静态化**：`HomePage` 只留 `MouseTrail` + 顶栏 + 五段 + 页脚；删掉健康检查门禁
   与三态 UI（`home-tokens.css` 的 `.home-state-*` 一并删除）。展示数据全部硬编码在各段
   组件顶部。顶栏入口仍读 `useUser`：那是导航去向而不是展示数据，删掉会让已登录用户
   找不到控制台入口——这是页面保留的唯一接口调用。
2. **一份 token**（`home-tokens.css`）：3 种表面、2 档墨、2 条线、brand/accent
   两个强调色（brand 管交互，accent 只管 11px mono 眉标与序号）、7 档字号、3 档圆角，
   骨架量（左右留白、上限宽度、竖向节奏、顶栏高度）。实测对比度：`--ink` 17.5:1，
   `--ink-muted` 5.2~6.0:1，`--accent` 5.9~6.2:1，`--brand` 12.7:1，
   全部过 AA。
3. **骨架收敛到三个钩子**：`.home-shell`（1720 上限 + `clamp(20px,4.5vw,88px)` 留白）、
   `.home-band`（`clamp(72px,6.5vw,112px)` 竖向节奏 + 锚点 `scroll-margin`）、
   `.home-cols`（并排列分隔线，≤1024px 换成上边框）。五段共用；字号收敛成 7 个类
   （`home-display/title/subtitle/lead/body/small/eyebrow`），四段标题统一 40px。
4. **类型层重置放进 `@layer base`**（层序已由 `index.css` 声明）。无层重置会压过
   utilities 层，此前只能把 margin 写在 CSS 里并加注释解释；现在间距交回 JSX 的
   Tailwind 工具类。
5. **修掉上面第 3 条的全部缺陷**：集成段按内容改成真实的 3 列（导入 / 使用 / MCP 共享）；
   任务链卡片重置为透明底 + 选中态白卡（用 `[aria-selected]` 驱动，不再靠 JS 加类）；
   hero 去掉指针光斑层（用户要求）；「查看接口」改成「查看集成」并指向 `#integration`。
6. **任务链截图落到 `public/assets/home/`**（4 张 webp，共 ~0.5MB），并写死 `width/height`
   与 16/10 画幅框：切换图不再跳版，静态页也不再依赖两个第三方 CDN（其中一个对 curl 403）。
7. **阶段条从「三个按钮」改成静态有序列表**：原先点了只换自己的高亮、不改变页面任何
   内容，静态展示页里不该留这种假控件。
8. **任务链段按参考图的设计语言重排**：段头改成「大标题 + 右侧文字链」（原来标题下面
   还有一句导语，与左列四条说明重复，删掉换成 `查看完整文档 →`）；左列从「白底卡片」
   改成条目列表——每条是「图标 + 粗标题 + 说明」，条目之间一条细横线，当前条目不换底色，
   只靠左侧 2px 竖条、墨色标题与品牌色图标区分（竖条用常驻的透明边框实现，切换不位移）；
   右列改成一张把截图撑满的浅色卡，画幅比写在图自身上（`aspect-ratio` 16/9），卡跟着
   图收边，切换不跳版也不裁图。
9. **删掉死 CSS 与死类名**：页脚在 base / `min-width:721` / `width<721` 三处的重复规则、
   `integration-brand-*`（元素早已删除）、`.site-shell` / `.hero-shell` / `.footer-legal-link`
   等只在 JSX 里出现却没有任何规则的类名、`ArkParticleAnimation` 注释里不存在的
   `styles/home-panels.css`、`home.css` 头注释里不存在的备份路径。
10. **首屏 = 顶栏 + hero**：`--nav-height` 一个值同时钉住顶栏高度（含底边）与 hero 的
    `min-height: min(calc(100svh - var(--nav-height)), 960px)`，高屏封顶给下一段留一角；
    hero 自身是 grid，内容在整屏里垂直居中。
11. **hero 与第一段按本仓真实链路重写**：hero 导语改成 agentic RAG 的说法（「把文档解析成
    可检索、可引用的知识，由智能体按需混合检索——每次回答都能回到原文核对」），三段从
    开放数据 / 向量流转 / AI 上下文 改成 解析入库 / 混合检索 / 依据作答；第一段由
    `capability-section.tsx` 改成 `rag-pipeline-section.tsx`（`id` 也从 `capabilities`
    改成 `rag-pipeline`）。
    - 右侧五步（解析 → 切分与索引 → 混合检索 → 重排 → 引用）是竖向列表：每行一条 2px 竖杠
      + 图标 + 标题，说明在下，行尾 `↗` 指向对应文档，行间细横线，悬停时整行淡品牌底、竖杠转
      品牌色、箭头位移——沿用本段原先的行语言，只是把行首从「首字缩进」换成一条竖杠。
    - 左列是四组能力清单，一组为「从 X 到 Y + 四个字定位 + 三条支持点」（入库 / 粗排到精排 /
      生成到溯源 / 评测到优化，顺序由用户定），文案由用户给定。
    - 网格因此翻转成左宽右窄（`minmax(0,1.5fr)` : `minmax(280px,1fr)`）：左列 746px 后每组
      三条点各占一行，段高从 1298 收到 1001。
    - 事实来源：`ars/knowledge/parser`（MinerU / PaddleOCR / DeepSeek OCR / PP-StructureV3）、
      `chunking`、`implementations/milvus.py` 的 vector / keyword(BM25) / hybrid 三种检索模式
      与重排、图谱检索开关、`parser/unified.py` 的 18 个后缀。
12. **段底色改成「纸白 / 下沉」交替**：第一段原来是整页唯一的纯白段，现在与任务链段一样用
    `--surface-sunken`，于是 hero(纸白) → RAG 流程(下沉) → 知识工作(纸白) → 任务链(下沉)
    → 集成(纸白) → 私有化部署(下沉) 逐段交替，页脚回到纯白作收口。`home-band-raised`
    随之删除（不再有 consumer）。
13. **集成段的名单按实际支持的能力重写并配标**：导入侧从「飞书 / Confluence / GitLab /
    语雀 …」改成三个真实外部数据源（Milvus / Dify / Notion，见
    `ars/knowledge/implementations/`）加 11 个解析器支持的文件格式；使用侧按用户给定收成
    Telegram / Chrome / BrowserSkill / MCP Server / API / CLI / DeepSeek Harness；
    厂商条每一项也配标。品牌标走 `@lobehub/icons`（Mono 形态，`fill: currentColor`，
    页面不出现品牌色），没有品牌标的四条（Milvus / Chrome / Telegram / LiteLLM）用
    lucide 的同类形状顶上（Database / Globe / Send / Waypoints）。
14. **品牌标单独一层 `lib/brand-logos.ts`**：`@lobehub/icons` 的包入口会把 `@lobehub/ui`
    连同 `@emoji-mart/data` 的 JSON 拉进来，那份 JSON 在 Node ESM 下需要 import attribute，
    会让**整份**用例文件加载失败（既有红线 `model-provider-panel.test.tsx` 就是这个原因，
    它的组件走的是包入口）。因此这里逐品牌深导入，并单独成一层，让用例只需替身这一个
    模块；`vi.mock('@/pages/home/lib/brand-logos')` 里的 14 个名字与这一层对齐，
    新增品牌要同时改两处。

15. **知识工作段从三块扩到六块**：在 RAG / Agent / Wiki 之外补 沙箱能力（`SANDBOX`，隔离执行 +
    持久 Workdir + 文件预览）、知识图谱（`GRAPH`，实体关系抽取 + 图谱检索 + 可视化）、
    技能支持（`SKILLS`，内置/自建技能按任务加载）；每块顶部加一个 16/10 图位，目前是虚线占位框
    （`data-placeholder="<分类标>"`，文案「截图占位」），换成真实截图时按 16/10 放进去版式不变。
    三列两行：`.pillar:nth-child(n+4)` 画行分隔线，列分隔线是
    `.pillar:not(:nth-child(3n+1))::before` 画在列间距正中，列间距本身交给 `column-gap`。
    不用内边距做列间隔（中列要多付一份，三列就不等宽，六张图位会差 30px 宽），
    也不复用 `.home-cols`（它只处理单行多列，第二行首列会被误加竖线）。
    每块头部是一行：`[图标] 标题` + 右侧分类标（原来图标独占一行、标题在下一行）。事实来源：
    `ars/agents`（middlewares / toolkits / skills / mcp 组合能力）、ARCHITECTURE.md 里
    内置 Skills 属 shipping contract、沙盒由 `sandbox-provisioner` 提供隔离执行与 Workdir 约束、
    `ars/knowledge/graphs`（LLM 抽取器 + 同名实体合并 + Neo4j/Milvus 图谱）。


16. **标签胶囊统一成灰底无描边**：`.home-chip` 从「白底 + 细描边」改成 `--surface-sunken` 填充、
    去边框（知识工作段的标签与集成段的渠道/格式/厂商胶囊共用这一个类，全页只有一种胶囊语言）。
    灰底取自原来 `.knowledge-work-tag` 的做法，也与两块能力所在纸白段的明暗关系一致。

17. **末尾加「私有化部署」段**（`deployment-section.tsx`，`id="deployment"`，眉标
    `05 / BUILT FOR YOUR TEAM`）：段头是「私有化部署，/ 按团队需要管理权限。」+ 右侧一句
    导语，下方三列 部署与存储 / 空间与资源权限 / 审计与运行监控，文案由用户给定（部署形态、
    多空间与角色矩阵、审计与运行监控）。用页面既有的三列骨架（`.home-cols` 竖分隔线、
    `home-icon` + `home-subtitle` + `home-body`），底色取 `--surface-sunken`，让
    「纸白 / 下沉」的交替延续到页脚前。参考图里这三列的图标是金色且列间没有分隔线，
    这里按页面语言用墨色图标 + 竖分隔线（要贴参考图，把 `.home-icon` 换成 `--accent`
    并去掉 `.home-cols` 即可）。

18. **页脚改成浅色单行**（参考外部产品的页脚样式）：去掉深色底与「状态条 + 版权 + 两个
    链接」的两行结构，改成纯白底 + 一条上边框的单行——左边是品牌标（头像 + 名称）与
    `私有内测 · © 2026 Ausdata Science Pty Ltd`，右边是 文档 / GitHub ↗ / 法律声明，
    链接从 mono 大写 12px 改成 15px 常规字重（中文大写变换本来也不起作用）。
    `--surface-inverse` 与 `--ink-inverse` / `--ink-inverse-muted` 随之删除：页脚是它们
    唯一的 consumer。参考图里品牌旁那句是 `Tencent Open Source · MIT License`，本仓没有
    `LICENSE` 文件，不写许可证声明，那一句保留原有的「私有内测 + 版权」。

19. **部署段三列文案按代码核实后重写**（2026-10-16）：第 17 条的文案是用户给定、没对照实现的版本，
    逐条核实后删掉了对不上实现的部分，换成能从源码指认的表述。

    | 原表述 | 核实结果 | 处理 |
    |---|---|---|
    | 向量数据库和存储后端可按需替换 | Milvus 是唯一向量实现（`knowledge/runtime.py` 只注册它，Dify / Notion 是只读连接器）；存储是 S3 协议 | 只留存储：对象存储走 S3 协议 |
    | 支持本地推理 | 本地 LLM 只能以自建 OpenAI 兼容端点接入（Ollama provider type 已移除）；自托管 GPU 推理只有文档解析（MinerU / PaddleX，compose `profiles: [all]`） | 删除 |
    | 四级角色矩阵 | 只有三级（`superadmin / admin / user`） | 改成三级并点名 |
    | API Key 按能力和知识库限定范围 | `APIKey` 无 scope / 知识库字段，权限等于绑定账号 | 删除 |
    | 支持 OIDC 身份集成 | 后端 OIDC 完整（`oidc_service.py` + 路由 + 用例），但前端回调页是 `PagePlaceholder` | 删除 |
    | 可限制服务只访问白名单域名 | 只有知识库 URL 抓取与远程技能来源两处白名单 | 删除 |
    | 空间审计日志、运行时任务队列面板 | `operation_logs` 有写入点但没有查询 API / 界面；任务中心只覆盖知识库与评估类后台任务，不含 AgentRun | 改成「全平台会话审计 + 任务中心」 |

    改写后每句都有 owner：Compose 拓扑、模型供应商界面（`builtin.py` + `providers/service.py`）、
    S3 协议（`storage/minio/client.py`）、三级角色 + `global/department/user` 共享范围
    （`permissions/resource_permission.py`）、会话审计表（`dashboard_router.py`）、任务中心
    （`ars/services/task_service.py` 的进程内 `_tasks` 含 `pending` / `running`）、Langfuse
    （`langfuse_service.py`，需自备 key）。段头导语与「一键初始化与启动」由用户同批给出，
    对应 `scripts/init.sh` 生成 `.env` 密钥 + Compose 起栈，已核对成立。《deployment-section.tsx》
    的文件注释里留了一份「刻意不写的四件事」，避免以后又把核实后删掉的表述写回去。

本次改版方向由用户直接给定（静态展示、统一颜色编码、删冗余、去掉光效、首屏占满），
没有待裁决的替代方向，因此直接写 `implemented`。

## 替代方案

- **保留健康检查，只把首页挪到别的路由**：展示页仍然会以「服务不可用」为先，与静态页定位冲突。
- **保留 5 个近色当段落节奏**：亮度差读不出来，边界像是意外；改用 3 种表面靠明暗交替分段。
- **保留 `--content-gutter` 的 11vw**：宽屏留白是参考站的特征，但 1280~1440 正是主用区间，
  22% 的宽度给留白会让两列头与 hero 文案一直挤；收成 `clamp(20px,4.5vw,88px)`。
- **修好显示条件、保留跟随指针的光斑**：用户明确要求去掉。
- **阶段条保留可切换、改成驱动真实内容**：没有真实内容可切，会再造一个假控件。
- **任务链截图继续外链**：静态页不该依赖会 403 的第三方 CDN。
- **把色值挪进 JSX 的任意值（`text-[var(--ink)]`）**：页面级色板已经有一份 token 表，
  再散进 JSX 就没有单一事实源。
- **改用 `100vh` 而不是 `100svh`**：移动端浏览器工具条会让 `100vh` 溢出，`svh` 才是安全值，
  不支持 `svh` 的浏览器会整条丢弃该声明、退回内容高度。

## 后果

- 首页不再有「服务不可用」状态；后端不可用时首页照常渲染，顶栏入口停在未登录分支。
- 表面只剩「纸白 / 纯白 / 下沉」三档（`--surface-inverse` 与两档反色墨随深色页脚一起删除，
  现在没有 consumer），段落边界靠明暗交替；新增段落必须在这三档里选一个，不能再自造近似白。
  字号只有 7 档。
- 改版后只有 `home-tokens.css`（15 个色值，即色板本身）与 `home.css`（9 个透明变体）
  出现颜色；此前是 51 个。
- 首页多了 `@lobehub/icons` 的 14 个品牌标（深导入，进首页 chunk：构建产物
  `dist/assets/home-*.js` 83 KB / gzip 29 KB），少一个 api 段与一个失效测试文件。
- 首页五个内容段的眉标是 band 级的 01~05，编号必须与文档顺序一致：段落顺序改了就同时改编号，
  否则段头测试（按 `main > section` 的文档顺序断言 /^01~05 \/ /）会红。段落 `id` 与编号无关，
  RAG 段的 `id` 从 `capabilities` 变成了 `rag-pipeline`，站内锚点若有引用要跟着改。
- 知识工作段的六个图位是占位框（`data-placeholder`）；换成真实截图时保持 16/10，
  否则六块的卡片高度会参差。
- 集成段的文案跟着真实能力走：不再出现飞书 / Confluence / 语雀 / Seafile 这些未接入的名字，
  文件格式也不再写成「PDF / Office」这种笼统说法；改动这些名单要同时核对后端
  `implementations/`、`parser/unified.py` 与 `builtin.py`。
- 品牌标是打包期依赖：给首页再加品牌时，`lib/brand-logos.ts` 与用例里的替身要一起改，
  否则图标会是 `undefined`（用例不渲染图标，因此不会红）。
- 阶段条不再可交互；「内置 30 家厂商」改成「部分已接入厂商」（列表只有 12 个，
  原数字与内容对不上）；任务链段少了原来那句导语（换成右侧的文档链），图下的小标题也
  去掉了（当前条目在左列已经由竖条与墨色标题标出）。
- hero 的 `min-height` 依赖 `--nav-height`：改顶栏高度要同时改这个 token，
  否则首屏会露出下一段或多留一条缝。
- `.home-cols` 的列留白是给文字列的；把卡片直接放进这个网格时要自己收掉（任务链段用
  `padding-inline: 0` + 左侧外边距），否则留白会算进卡片、把图裁掉或挤偏。

## 验证

- 浏览器实测（5174 开发服务器，1440×900）：首屏 = 顶栏 69px + hero 831px，`#capabilities`
  正好从 y=900 开始；hero 内容在 831px 里垂直居中（文案 top 255 / 粒子画布 top 245）。
  点击「查看集成」后 `location.hash=#integration`、段落顶边停在 76px（`scroll-margin-top`），
  不被 69px 吸顶顶栏压住。方块字悬停：点阵 `opacity .38 → .88`、扫线 `animation: matrix-scan`
  且 `opacity .85`。集成段三列链接顶边同为 483px。
- 任务链段（1440）：左列 368px、卡片 852×480 紧贴图（图 850×478、`object-fit: contain`
  无留白、无裁切），刷新后默认停在第二条（`aria-selected` 与面板 `aria-labelledby`
  都指向 `task-chain-tab-1`，图为 `knowledge.webp`）。
- RAG 流程段（1440）：左列四组清单 746×660、右列五步 497×814，段高 1001；每行竖杠 2px、
  默认 `--line-strong`，`getComputedStyle` 里 `:hover` 规则命中（`border-left-color: --brand`
  且 `background: --brand-wash`）；1440 与 390 下行结构与换行都正常。
- 窄屏 390×844：三段阶段条居中、按钮满宽、移动端菜单展开为白底面板且汉堡变叉；
  任务链左列条目与分隔线正常、标题与右侧链接换行；RAG 五步与集成段的三组胶囊逐组换行，
  知识工作 / 集成段转单列，列间竖线变上边框。
- 集成段核对：21 个胶囊与 12 个厂商项全部带上了图标（`chipsWithSvg === chips`、
  `vendorsWithSvg === vendors`）。
- 单测 `test/unit/pages/home-page.test.tsx`：7 passed（改版前 5 failed / 3 passed）。
  新增负向契约「静态页不请求系统信息与健康检查」与结构断言「每个并排网格声明的轨道数
  与子元素数一致」（后者正是集成段空轨道与任务链列留白的回归测试）。文案句子的断言改成了
  结构断言（段头存在、眉标为 01~05、流程五步、三列、12 个厂商、页脚版权），因为文案是
  直接在组件里改的，逐句断言会随每次改词变红。
- 知识工作段（1440）：六块三列两行，列间竖线、行间上边框各一条；六张图位实测只有一种尺寸
  （401×251，16/10），六行头部的图标与标题中轴差 <6px（同行）。窄屏 390：转单列、图位满宽。
- 私有化部署段（1440）：三列各 433px，段高 569；窄屏 390 转单列、列间细线上移为上边框。
- 页脚（1440）：纯白底 + 1px 上边框、单行 105px，品牌与版权在左、三个入口在右
  （`文档` / `GitHub ↗` / `法律声明`，href 各自指向文档站、仓库与隐私声明）；390 下左组
  换行、链接另起一行，整段 153px。
- 一条与本次无关的红线：`features/chat/global-search-modal.test.tsx` 的
  「未输入时显示新对话与最近会话分组」在同一天多次全量运行里时红时绿，该文件不引用首页
  任何模块，判为运行负载下的抖动；它不在基线清单里，也不是本次改动引入的。
- 门禁：`node scripts/check-design-tokens.mjs` 通过；`npx oxlint src` 31 warnings and 3 errors，
  与基线逐字相同且 `src/pages/home` 无新增；`npx tsc --noEmit` 5 个错，全部是既有的
  `workspace-ui.test.tsx`；`npx steiger ./src` 无问题；`npx vite build` 成功（首页 chunk
  83 KB / gzip 29 KB）。全量单测 8 failed / 14 failed tests，与基线同一集合
  （`home-page` 与已删除的 `nexus-console` 之外没有新增失败）。`git diff --check` 干净。
- 一条基线红线的根因已定位但未修（不在本次改动面内）：`model-provider-panel.test.tsx`
  是文件级失败，原因是 `features/model-providers/ui/provider-icon.tsx` 走
  `@lobehub/icons` 包入口 → `@lobehub/ui` → `@emoji-mart/data` 的 JSON。修法与首页相同：
  换深导入，或在用例里替身该图标模块。
- 旧能力不存在：页面不再发健康检查与系统信息请求（负向测试守住）；`src/pages/home/api/`
  整个目录已删除，`access-tabs.ts` / `runtime-endpoint.ts` 与
  `test/unit/pages/nexus-console.test.tsx`（引用已删除组件、无法编译）不再存在；
  `home.css` 里 `.home-state-*`、`.integration-brand-*`、`.hero-spotlight` 与页脚三处重复
  规则均已删除；`.tsx` 与页面 CSS 里不再出现近似的五个表面色。
- 重新引入条件：需要「服务不可用」提示、跟随指针的光效、可切换的阶段条或第三方 CDN 截图时，
  要在本记录或新记录里说明新的语义 Owner 与证据，并把对应 token / 类名加回来，
  不能只在 JSX 里临时补一份近似实现。
