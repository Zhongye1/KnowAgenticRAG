/**
 * Hero 里的「RAG 链路」三段：解析入库 → 混合检索 → 依据作答。
 *
 * 静态陈列：三段都直接显示，不设选中态。原先这里是三个按钮，点了只换自己的高亮，
 * 不改变页面任何内容，因此在静态展示页里改成有序列表。文案对齐本仓真实链路
 * （`ars/knowledge` 的 parser / chunking / implementations 与重排、图谱检索开关）。
 */
import { BrainCircuit, ScanText, SearchCheck } from 'lucide-react';

const STAGES = [
  {
    id: 'ingest',
    label: '多源入链',
    detail: '多模态解析与语义切分，向量与图谱双索引，混合召回',
    Icon: ScanText,
  },
  {
    id: 'retrieve',
    label: '智能体中枢',
    detail: '自主规划、多跳检索、反思迭代，按需调度检索与工具',
    Icon: SearchCheck,
  },
  {
    id: 'answer',
    label: '溯源生成',
    detail: '回答结果附来源引用，多步任务沿同一条链路复用',
    Icon: BrainCircuit,
  },
] as const;

export const HeroDataFlow = () => (
  <ol
    className="stage mt-[clamp(24px,2.4vw,32px)] grid-cols-3"
    aria-label="RAG 链路阶段"
  >
    {STAGES.map(({ id, label, detail, Icon }) => (
      <li
        key={id}
        className="flex min-h-[94px] flex-col gap-[5px] px-3 pt-[13px] pb-3 max-[721px]:min-h-[76px] max-[721px]:items-center max-[721px]:justify-center max-[721px]:gap-[7px] max-[721px]:px-1 max-[721px]:py-[9px] max-[721px]:text-center"
      >
        <span className="flex items-center gap-2 max-[721px]:flex-col max-[721px]:gap-[7px]">
          <Icon
            className="hero-icon flex-none"
            width={17}
            height={17}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <strong className="stage-label">{label}</strong>
        </span>
        <span className="stage-detail line-clamp-2 max-[721px]:hidden">
          {detail}
        </span>
      </li>
    ))}
  </ol>
);
