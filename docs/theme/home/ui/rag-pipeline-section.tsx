/**
 * RAG 流程段：左列四组能力 + 右侧五步流程。
 *
 * 右侧五步按本仓真实实现写：解析器与分块策略在 `ars/knowledge/parser` 与 `chunking`，
 * 检索/重排/图谱开关在 `knowledge/implementations/milvus.py`（vector / keyword(BM25) /
 * hybrid 三种模式），文件白名单在 `parser/unified.py`。
 */
import {
  Boxes,
  ChevronRight,
  ListOrdered,
  Quote,
  ScanText,
  SearchCheck,
} from 'lucide-react';
import { Link } from '@theme';

import { outbound } from '../lib/links';

/** 左列四组能力：入库 → 召回与精排 → 评测 → 生成与溯源，每组一句定位名 + 三条支持点。 */
const GROUPS = [
  {
    title: '从上传到入库',
    tagline: '建库零门槛',
    points: [
      '支持文档、图表、图像统一解析，PDF、Word、Markdown 拖拽即传，格式不再是门槛',
      '支持按语义智能切分，段落边界不破坏上下文，切得准，才检索得准',
      '支持解析、向量化、建索引一条流水线自动完成，上传完毕即可提问',
    ],
  },
  {
    title: '从粗排到精排',
    tagline: '快与准兼得',
    points: [
      '支持多路向量与 BM25 混合召回，语义相近、字面精确，两条路径同时命中',
      '支持挂载重排模型二次精排，最相关的片段优先进入生成上下文',
      '支持召回结果融合去重与过滤，噪声片段拦在门外，上下文干净高效',
    ],
  },

  {
    title: '从生成到溯源',
    tagline: '答案可验证',
    points: [
      '支持基于检索证据生成回答，事实交给知识库，模型只负责组织语言',
      '支持引用定位到原文段落，点击即跳转，前后文一眼核对',
      '支持答案与出处一一对应，每一句结论，都能找到来源',
    ],
  },
  {
    title: '从评测到优化',
    tagline: '优化有依据',
    points: [
      '支持检索环节独立评测，召回率、命中率、MRR 逐项量化，检索好不好，指标说了算',
      '支持生成质量多维打分，忠实度、相关性、引用准确性全覆盖，答案可不可信，有量表可依',
      '支持评测集跑批与回归对比，换模型、调切分、改参数，改完即测，进退有数',
    ],
  },
] as const;

/** 流程五步：一步一行，图标 + 标题 + 说明。 */
const STEPS = [
  {
    title: '解析',
    Icon: ScanText,
    description:
      '多模态抽取文字、表格与图片：MinerU、PaddleOCR、DeepSeek OCR 按类型选用。',
    href: outbound.docsParsing,
  },
  {
    title: '切分与索引',
    Icon: Boxes,
    description: '按语义切块并向量化写入 Milvus，图谱补上实体与关系。',
    href: outbound.docsKnowledge,
  },
  {
    title: '混合检索',
    Icon: SearchCheck,
    description: '向量与 BM25 双路召回并融合，也可以只走其中一路。',
    href: outbound.docsMechanisms,
  },
  {
    title: '重排',
    Icon: ListOrdered,
    description: '重排模型对候选片段重新打分，取最相关的前若干条。',
    href: outbound.docsModels,
  },
  {
    title: '引用',
    Icon: Quote,
    description: '回答附来源片段，点开就能回到原文核对。',
    href: outbound.docsKnowledge,
  },
] as const;

export const RagPipelineSection = () => (
  <section
    id="rag-pipeline"
    className="home-band home-band-sunken"
    aria-labelledby="rag-pipeline-title"
  >
    <div className="home-shell">
      <p className="home-eyebrow mb-4">03 / RAG PIPELINE</p>

      {/* 标题放在段头通栏，两列的清单才能从同一条基线开始 */}
      <div className="home-band-head">
        <h2 id="rag-pipeline-title" className="home-title home-rule table">
          完整的RAG链路集成
          <br />
        </h2>
      </div>

      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] gap-x-[clamp(32px,4vw,72px)] gap-y-10 max-[1024px]:grid-cols-1">
        <ul className="pipe-groups">
          {GROUPS.map((group) => (
            <li className="pipe-group" key={group.title}>
              <div className="pipe-group-head">
                <h3 className="pipe-group-title">{group.title}</h3>
                <span className="pipe-group-tagline">{group.tagline}</span>
              </div>
              <ul className="pipe-group-points">
                {group.points.map((point) => (
                  <li className="pipe-point" key={point}>
                    <ChevronRight
                      width={16}
                      height={16}
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <ul className="pipe-list">
          {STEPS.map(({ title, Icon, description, href }) => (
            <li className="pipe-step" key={title}>
              <Link className="pipe-step-link" href={href}>
                <div>
                  <h3 className="pipe-step-title">
                    <Icon
                      className="pipe-step-icon"
                      size={20}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    {title}
                  </h3>
                  <p className="home-body">{description}</p>
                </div>
                <span className="pipe-step-arrow" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  </section>
);
