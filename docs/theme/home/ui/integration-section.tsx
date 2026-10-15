/**
 * 集成段：导入侧 / 使用侧 / MCP 三列 + 末尾的模型厂商条。
 *
 * 列表内容按实际支持的能力写：导入侧是三个外部数据源（后端
 * `ars/knowledge/implementations/` 的 Milvus / Dify / Notion）与解析器支持的格式
 * （后端 `parser/unified.py` 的 SUPPORTED_FILE_EXTENSIONS）；使用侧是与本平台对接的
 * 客户端与开发入口；厂商条是可直接配置的模型品牌。
 *
 * 图标：品牌走 `lib/brand-logos.ts`（`@lobehub/icons` 的 Mono 形态，`fill: currentColor`），
 * 跟随胶囊文字色；没有品牌图标的条目（Milvus、Chrome、Telegram、LiteLLM）用 lucide 的
 * 同类形状顶上。配置面板的 provider_id → 品牌映射在
 * `features/model-providers/ui/provider-icon.tsx`，那份只收内置供应商；本页的展示名单
 * 含内置之外的品牌（混元 / 火山引擎 / Ollama），因此在页面就近映射。
 */
import {
  Braces,
  Code,
  Database,
  FileArchive,
  FileCode,
  FileImage,
  FileInput,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileType,
  Files,
  Globe,
  MousePointerClick,
  Network,
  Plug,
  Presentation,
  Send,
  SquareTerminal,
  Table,
  Waypoints,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { Link } from '@theme';

import {
  Claude,
  DeepSeek,
  Dify,
  Gemini,
  Hunyuan,
  Kimi,
  MCP,
  Minimax,
  Notion,
  Ollama,
  OpenAI,
  Qwen,
  Volcengine,
  Zhipu,
} from '../lib/brand-logos';
import { outbound } from '../lib/links';

/** 品牌图标与 lucide 图标都接受 `size`，胶囊与厂商条按同一形状取用。 */
type Logo = ComponentType<{ size?: number | string; 'aria-hidden'?: boolean }>;

type Item = { label: string; Icon: Logo };

/** 外部数据源：连上就能检索，不落本仓文档。 */
const DATA_SOURCES: readonly Item[] = [
  { label: 'Milvus', Icon: Database },
  { label: 'Dify', Icon: Dify },
  { label: 'Notion', Icon: Notion },
];

/** 可直接上传解析的文件格式。 */
const FILE_FORMATS: readonly Item[] = [
  { label: 'PDF', Icon: FileText },
  { label: 'Word', Icon: FileType },
  { label: 'Excel', Icon: FileSpreadsheet },
  { label: 'PowerPoint', Icon: Presentation },
  { label: 'Markdown', Icon: FileCode },
  { label: 'TXT', Icon: Files },
  { label: 'CSV', Icon: Table },
  { label: 'JSON', Icon: FileJson },
  { label: 'HTML', Icon: Code },
  { label: '图片', Icon: FileImage },
  { label: 'ZIP', Icon: FileArchive },
];

/** 客户端与开发入口。 */
const CLIENT_CHANNELS: readonly Item[] = [
  { label: 'Telegram', Icon: Send },
  { label: 'Chrome', Icon: Globe },
  { label: 'BrowserSkill', Icon: MousePointerClick },
  { label: 'MCP Server', Icon: MCP },
  { label: 'API', Icon: Braces },
  { label: 'CLI', Icon: SquareTerminal },
  { label: 'DeepSeek Harness', Icon: DeepSeek },
];

/** 模型厂商；LiteLLM 是网关而不是厂商，用「代理」形状表达。 */
const MODEL_VENDORS: readonly Item[] = [
  { label: 'OpenAI', Icon: OpenAI },
  { label: 'Claude', Icon: Claude },
  { label: 'Gemini', Icon: Gemini },
  { label: 'DeepSeek', Icon: DeepSeek },
  { label: 'Qwen', Icon: Qwen },
  { label: '混元', Icon: Hunyuan },
  { label: '智谱', Icon: Zhipu },
  { label: 'Kimi', Icon: Kimi },
  { label: '火山引擎', Icon: Volcengine },
  { label: 'MiniMax', Icon: Minimax },
  { label: 'Ollama', Icon: Ollama },
  { label: 'LiteLLM', Icon: Waypoints },
];

/** 图标 + 文字的胶囊行。 */
const ChipRow = ({ items }: { items: readonly Item[] }) => (
  <ul className="home-chips mt-[clamp(20px,2vw,28px)]">
    {items.map(({ label, Icon }) => (
      <li className="home-chip" key={label}>
        <Icon size={16} aria-hidden />
        {label}
      </li>
    ))}
  </ul>
);

export const IntegrationSection = () => (
  <section
    id="integration"
    className="home-band"
    aria-labelledby="integration-title"
  >
    <div className="home-shell">
      <p className="home-eyebrow mb-4">04 / INTEGRATION</p>

      <div className="home-band-head flex flex-wrap items-end justify-between gap-x-[clamp(24px,4vw,72px)] gap-y-4">
        <h2 id="integration-title" className="home-title max-w-[15em]">
          数据源与工具集成
        </h2>
        <p className="home-body max-w-[30em]">
          上传文档交给解析器，或连上外部数据源；再用 IM、浏览器插件、MCP Server 或 API
          把结果取走。
        </p>
      </div>

      {/* 三列是三个并列的集成侧：导入 / 使用 / 共享 */}
      <div className="home-cols grid grid-cols-3 max-[1024px]:grid-cols-1">
        <article className="flex flex-col pt-[clamp(24px,2.6vw,40px)]">
          <FileInput
            className="home-icon"
            size={30}
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <h3 className="home-subtitle mt-[clamp(22px,2.2vw,32px)]">
            导入与同步资料
          </h3>
          <p className="home-body mt-[clamp(12px,1.4vw,18px)]">
            上传文件就地解析，或连接外部数据源直接检索。
          </p>
          <ChipRow items={DATA_SOURCES} />
          <ChipRow items={FILE_FORMATS} />
          <Link
            className="home-link mt-auto pt-[clamp(22px,2.4vw,32px)]"
            href={outbound.docsKnowledge}
          >
            数据源集成
            <span aria-hidden="true">→</span>
          </Link>
        </article>

        <article className="flex flex-col pt-[clamp(24px,2.6vw,40px)]">
          <Network
            className="home-icon"
            size={30}
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <h3 className="home-subtitle mt-[clamp(22px,2.2vw,32px)]">
            在常用工具中访问
          </h3>
          <p className="home-body mt-[clamp(12px,1.4vw,18px)]">
            支持 IM 问答、浏览器插件、MCP 客户端和开发工具集成。
          </p>
          <ChipRow items={CLIENT_CHANNELS} />
          <Link
            className="home-link mt-auto pt-[clamp(22px,2.4vw,32px)]"
            href={outbound.docsApi}
          >
            客户端与渠道
            <span aria-hidden="true">→</span>
          </Link>
        </article>

        <article className="flex flex-col pt-[clamp(24px,2.6vw,40px)]">
          <Plug
            className="home-icon"
            size={30}
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <h3 className="home-subtitle mt-[clamp(22px,2.2vw,32px)]">
            通过 MCP Server 共享知识
          </h3>
          <p className="home-body mt-[clamp(12px,1.4vw,18px)]">
            让 Claude、Cursor 等 AI 工具连接团队知识库，直接检索资料和提问。
          </p>
          <Link
            className="home-link mt-auto pt-[clamp(22px,2.4vw,32px)]"
            href={outbound.docsMcp}
          >
            配置 MCP 端点
            <span aria-hidden="true">→</span>
          </Link>
        </article>
      </div>

      <div className="vendor-strip mt-[clamp(32px,3.4vw,48px)] pt-[clamp(20px,2.2vw,30px)]">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <span className="home-body home-small">
            模型由你选择 · 部分已接入厂商
          </span>
          <Link className="home-link" href={outbound.docsModels}>
            查看全部
            <span aria-hidden="true">→</span>
          </Link>
        </div>
        <ul className="vendor-list mt-[clamp(16px,1.8vw,24px)]">
          {MODEL_VENDORS.map(({ label, Icon }) => (
            <li className="flex items-center gap-2" key={label}>
              <Icon size={18} aria-hidden />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  </section>
);
