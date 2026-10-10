/**
 * 指标条：内容照搬参照实现的 `metrics-horizon.tsx`。
 *
 * 来源：AI Website Cloner Template 0.6.1（MIT，JCodesMore）里的 AusVector 首页克隆。
 */

const SPECS = [
  { label: 'Data structure', value: 'Structured records' },
  { label: 'Vector flow', value: 'Relationship mapping' },
  { label: 'Provenance', value: 'Traceable sources' },
  { label: 'Grounding', value: 'Evidence-linked context' },
  { label: 'Interfaces', value: 'MCP / HTTP / CLI' },
] as const;

export const MetricsHorizon = () => {
  return (
    <section className="metrics-horizon" aria-label="Platform capabilities">
      <div className="metrics-horizon-rail">
        <div className="metrics-horizon-inner">
          <div className="metrics-horizon-specs">
            {SPECS.map((spec) => (
              <div className="metrics-horizon-spec" key={spec.label}>
                <span className="metrics-horizon-label">{spec.label}</span>
                <span className="metrics-horizon-value">{spec.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
