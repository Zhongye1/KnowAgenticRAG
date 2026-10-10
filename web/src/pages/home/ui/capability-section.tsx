/**
 * 能力段落：内容照搬参照实现的 `capability-section.tsx`。
 *
 * 来源：AI Website Cloner Template 0.6.1（MIT，JCodesMore）里的 AusVector 首页克隆。
 * 卡片链接指向本仓文档站（参照指向它自己的文档锚点）。
 */
import { ChevronRight } from 'lucide-react';

import { outbound } from '../lib/links';

const USE_CASES = [
  'Discover and retrieve records across supported datasets',
  'Trace results to structured, source-aware information',
  'Ground AI workflows in open data',
] as const;

const CAPABILITIES = [
  {
    title: 'Discover',
    description: 'Find relevant records across supported open datasets.',
    href: outbound.docsKnowledge,
  },
  {
    title: 'Retrieve',
    description: 'Access structured records through consistent interfaces.',
    href: outbound.docsOperations,
  },
  {
    title: 'Verify',
    description: 'Trace results to source information and provenance.',
    href: outbound.docsMechanisms,
  },
  {
    title: 'Analyse',
    description: 'Use grounded open data in AI and analytical workflows.',
    href: outbound.docsQuickStart,
  },
  {
    title: 'Integrate',
    description: 'Connect through MCP, HTTP API, CLI, or Agent Runtime.',
    href: outbound.docs,
  },
] as const;

export const CapabilitySection = () => {
  return (
    <div id="capabilities-section" className="capability-band">
      <div className="capability-shell">
        <section
          className="capability-section"
          aria-labelledby="capabilities-title"
        >
          <div className="section-intro">
            <h2 id="capabilities-title">
              Open data
              <br />
              <em>ready to use</em>
            </h2>
            <ul
              className="capability-use-cases"
              aria-label="What you can do with open data"
            >
              {USE_CASES.map((useCase) => (
                <li key={useCase}>
                  <ChevronRight
                    className="lucide capability-dataset-arrow"
                    width={16}
                    height={16}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                  <span>{useCase}</span>
                </li>
              ))}
            </ul>
            <p className="capability-intro">
              {
                'Access these capabilities through MCP, HTTP API, CLI, and Agent Runtime.'
              }
            </p>
          </div>

          <div className="capability-list">
            {CAPABILITIES.map((capability) => (
              <a
                className="capability-item"
                href={capability.href}
                key={capability.title}
              >
                <div>
                  <h3>{capability.title}</h3>
                  <p>{capability.description}</p>
                </div>
                <span className="item-arrow">↗</span>
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
