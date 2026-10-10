/**
 * Hero 的「选择阶段」控件：内容照搬参照实现的 `hero-data-flow.tsx`。
 *
 * 与参照的差异：参照的阶段来自 atlas 场景的 `WAYPOINTS` 并由 `useDataAtlas` 驱动，
 * 本仓不搬 atlas，阶段改成组件内的常量加本地选中态，文案与参照一致。
 *
 * 来源：AI Website Cloner Template 0.6.1（MIT，JCodesMore）里的 AusVector 首页克隆。
 */
import { Activity, BrainCircuit, Database } from 'lucide-react';
import * as React from 'react';

const STAGES = [
  {
    id: 'orbit',
    label: 'Open Data',
    detail: 'Structured public sources for AI',
    Icon: Database,
  },
  {
    id: 'topology',
    label: 'Vector Flow',
    detail: 'A method for tracing relationships across data',
    Icon: Activity,
  },
  {
    id: 'runtime',
    label: 'AI Context',
    detail: 'Grounded workflows with traceable sources',
    Icon: BrainCircuit,
  },
] as const;

export const HeroDataFlow = () => {
  const [activeStage, setActiveStage] = React.useState<string>(STAGES[0].id);

  return (
    <div className="hero-data-flow" aria-label="Interactive data flow model">
      <div className="hero-data-flow-heading">
        <span>Select a stage</span>
      </div>
      <div className="hero-data-flow-stages">
        {STAGES.map((stage) => {
          const Icon = stage.Icon;
          const isActive = activeStage === stage.id;
          return (
            <button
              key={stage.id}
              type="button"
              className={`hero-data-flow-stage ${isActive ? 'is-active' : ''}`}
              aria-pressed={isActive}
              onClick={() => setActiveStage(stage.id)}
            >
              <Icon
                className="lucide hero-data-flow-icon"
                width={17}
                height={17}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <strong className="hero-data-flow-label-desktop">
                {stage.label}
              </strong>
              <strong className="hero-data-flow-label-mobile">
                {stage.label}
              </strong>
              <span className="hero-data-flow-detail">{stage.detail}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
