/**
 * 知识库检索（`query_kb`）的结果主体。
 *
 * 三块内容：命中片段（按来源文件分组，展开后看片段正文与分数）、图谱数据
 * （实体 / 关系 / 引用的摘要与列表）、以及都没有时的空态。
 *
 * 与参照的差别：参照点开文件会弹「片段」与「文件详情」两个弹窗，后者属于知识库切片；
 * 这里改成行内展开，避免 `features/chat` 反向依赖知识库，也省掉一个跨切片的中间层。
 */
import type { KbQueryResult } from '../lib/kb-query-result';
import { KbChunkGroups } from './kb-chunk-groups';

type KbQueryResultViewProps = {
  result: KbQueryResult;
};

export const KbQueryResultView = ({ result }: KbQueryResultViewProps) => (
  <div className="flex flex-col gap-3">
    <KbChunkGroups chunks={result.chunks} />

    {result.hasGraphData ? (
      <div className="flex flex-col gap-2 rounded-medium border border-[var(--gray-150)] p-2.5">
        <p className="text-[var(--gray-800)]">
          图谱检索: 实体 {result.entities.length} 个, 关系{' '}
          {result.relationships.length} 条, 引用 {result.references.length} 条
        </p>

        {result.entities.length > 0 ? (
          <section className="flex flex-col gap-1">
            <h6 className="text-[var(--gray-500)]">实体</h6>
            {result.entities.map((entity, index) => (
              <div
                key={`entity-${index}-${entity.name}`}
                className="flex flex-col"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[var(--gray-1000)]">{entity.name}</span>
                  <span className="text-xs text-[var(--gray-500)]">
                    {entity.type}
                  </span>
                </div>
                {entity.description ? (
                  <p className="text-[var(--gray-800)]">{entity.description}</p>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}

        {result.relationships.length > 0 ? (
          <section className="flex flex-col gap-1">
            <h6 className="text-[var(--gray-500)]">关系</h6>
            {result.relationships.map((relation, index) => (
              <div
                key={`relation-${index}`}
                className="flex items-center gap-2"
              >
                <span className="text-[var(--gray-1000)]">
                  {relation.srcId}
                </span>
                <span aria-hidden>→</span>
                <span className="text-[var(--gray-1000)]">
                  {relation.tgtId}
                </span>
                <span className="text-[var(--gray-500)]">
                  {relation.keywords}
                </span>
              </div>
            ))}
          </section>
        ) : null}

        {result.references.length > 0 ? (
          <section className="flex flex-col gap-1">
            <h6 className="text-[var(--gray-500)]">引用</h6>
            {result.references.map((reference, index) => (
              <a
                key={`reference-${index}`}
                href={reference.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--main-600)] hover:underline"
              >
                {reference.label}
              </a>
            ))}
          </section>
        ) : null}
      </div>
    ) : null}

    {result.chunks.length === 0 && !result.hasGraphData ? (
      <p className="py-3 text-center text-xs text-[var(--gray-500)]">
        未找到相关知识库内容
      </p>
    ) : null}
  </div>
);
