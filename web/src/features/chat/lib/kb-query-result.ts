/**
 * 知识库检索（`query_kb`）结果的解析。
 *
 * 结果可能同时带三块：命中片段（`results` 或 `chunks`）、图谱数据（`entities` /
 * `relationships` / `references`）、以及什么都没有。本模块只做解析与文案，渲染在
 * 后续的 UI 主体里。
 */
import type { ChatToolCall } from '../api/agent-api';

export type KbQueryChunk = {
  content: string;
  score: number | null;
  source: string;
  fileId: string;
  /** 检索结果 id，通常就是 chunk_id；用于去重。 */
  chunkId: string;
  /** 结果所属知识库；结果条目自带，取不到时为空串。 */
  kbId: string;
};

export type KbQueryEntity = {
  name: string;
  type: string;
  description: string;
};

export type KbQueryRelation = {
  srcId: string;
  tgtId: string;
  keywords: string;
};

export type KbQueryReference = {
  url: string;
  label: string;
};

export type KbQueryResult = {
  chunks: KbQueryChunk[];
  entities: KbQueryEntity[];
  relationships: KbQueryRelation[];
  references: KbQueryReference[];
  /** 三块图谱数据里任意一块非空。 */
  hasGraphData: boolean;
};

const EMPTY: KbQueryResult = {
  chunks: [],
  entities: [],
  relationships: [],
  references: [],
  hasGraphData: false,
};

/** 截断到 `maxLength` 个字符，超出加省略号。 */
export function previewText(text: unknown, maxLength = 100): string {
  const normalized = String(text ?? '');

  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength)}...`;
}

/** 片段：`results` 与 `chunks` 两种字段名都接受。 */
function normalizeChunks(payload: Record<string, unknown>): KbQueryChunk[] {
  const raw = Array.isArray(payload.results)
    ? payload.results
    : Array.isArray(payload.chunks)
      ? payload.chunks
      : [];

  return raw
    .map((item) => {
      const chunk = item as Record<string, unknown> | null;
      const metadata = (chunk?.metadata ?? {}) as Record<string, unknown>;
      const pick = (...keys: string[]): string => {
        for (const key of keys) {
          const value = metadata[key] ?? chunk?.[key];
          if (typeof value === 'string' && value) return value;
        }

        return '';
      };

      // 本仓的检索结果把 `file_id` 放在条目顶层（`SearchResultSchema`），参照放在
      // metadata 里，两处都要认
      const topLevelFileId =
        typeof chunk?.file_id === 'string' ? chunk.file_id : '';

      return {
        content: typeof chunk?.content === 'string' ? chunk.content : '',
        score:
          typeof chunk?.score === 'number'
            ? chunk.score
            : typeof metadata.score === 'number'
              ? metadata.score
              : null,
        // 来源的兜底链与参照一致；全都没有时归到「未知来源」而不是空串
        source:
          pick(
            'source',
            'file_name',
            'filename',
            'title',
            'file_id',
            'kb_id',
          ) || '未知来源',
        fileId:
          topLevelFileId ||
          (typeof metadata.file_id === 'string' ? metadata.file_id : ''),
        chunkId:
          typeof chunk?.id === 'string'
            ? chunk.id
            : typeof metadata.chunk_id === 'string'
              ? metadata.chunk_id
              : '',
        kbId:
          typeof chunk?.kb_id === 'string'
            ? chunk.kb_id
            : typeof metadata.kb_id === 'string'
              ? metadata.kb_id
              : '',
      };
    })
    .filter((chunk) => chunk.content !== '');
}

function normalizeEntities(raw: unknown): KbQueryEntity[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item) => {
    const entity = item as Record<string, unknown> | null;
    const name =
      typeof entity?.entity_name === 'string' && entity.entity_name
        ? entity.entity_name
        : typeof entity?.name === 'string' && entity.name
          ? entity.name
          : '未命名实体';
    const type =
      typeof entity?.entity_type === 'string' && entity.entity_type
        ? entity.entity_type
        : typeof entity?.type === 'string' && entity.type
          ? entity.type
          : '未分类';

    return {
      name,
      type,
      description: previewText(entity?.description, 220),
    };
  });
}

function normalizeRelationships(raw: unknown): KbQueryRelation[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item) => {
    const relation = item as Record<string, unknown> | null;

    return {
      srcId: typeof relation?.src_id === 'string' ? relation.src_id : '-',
      tgtId: typeof relation?.tgt_id === 'string' ? relation.tgt_id : '-',
      keywords:
        typeof relation?.keywords === 'string' && relation.keywords
          ? relation.keywords
          : '关联',
    };
  });
}

function normalizeReferences(raw: unknown): KbQueryReference[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item, index) => {
    const reference = item as Record<string, unknown> | null;
    const url =
      typeof reference?.file_path === 'string' && reference.file_path
        ? reference.file_path
        : typeof reference?.url === 'string' && reference.url
          ? reference.url
          : '#';
    const id =
      typeof reference?.reference_id === 'string' && reference.reference_id
        ? reference.reference_id
        : `#${index + 1}`;

    return { url, label: `${id}: ${url}` };
  });
}

/** 解析结果内容；形状不符时返回空结果。 */
export function parseKbQueryResult(content: unknown): KbQueryResult {
  let payload: unknown = content;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return EMPTY;
    }
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return EMPTY;
  }

  const record = payload as Record<string, unknown>;
  const chunks = normalizeChunks(record);
  const entities = normalizeEntities(record.entities);
  const relationships = normalizeRelationships(record.relationships);
  const references = normalizeReferences(record.references);

  return {
    chunks,
    entities,
    relationships,
    references,
    hasGraphData:
      entities.length > 0 || relationships.length > 0 || references.length > 0,
  };
}

/**
 * 头部的结果摘要：片段与图谱都有时并报，只有其一时各自报数，
 * 请求成功但两块都空时报「未找到结果」。
 */
export function kbQuerySummary(toolCall: ChatToolCall): string {
  const content = toolCall.tool_call_result?.content;
  if (content === undefined && toolCall.status !== 'success') return '';

  const result = parseKbQueryResult(content);
  const chunkCount = result.chunks.length;
  const entityCount = result.entities.length;
  const relationCount = result.relationships.length;

  if (chunkCount > 0 && (entityCount > 0 || relationCount > 0)) {
    return `${chunkCount} 条片段，${entityCount} 个实体`;
  }
  if (chunkCount > 0) return `${chunkCount} 个结果`;
  if (entityCount > 0 || relationCount > 0) {
    return `${entityCount} 个实体，${relationCount} 条关系`;
  }
  if (content !== undefined || toolCall.status === 'success')
    return '未找到结果';

  return '';
}

export type KbChunkFileGroup = {
  key: string;
  filename: string;
  chunks: KbQueryChunk[];
};

/** 按来源把片段分组，保留首次出现的顺序。 */
export function groupChunksByFile(chunks: KbQueryChunk[]): KbChunkFileGroup[] {
  const groups = new Map<string, KbChunkFileGroup>();

  for (const chunk of chunks) {
    const key = chunk.fileId || chunk.source;
    const existing = groups.get(key);
    if (existing) {
      existing.chunks.push(chunk);
      continue;
    }

    groups.set(key, { key, filename: chunk.source, chunks: [chunk] });
  }

  return [...groups.values()];
}

/** 片段摘要：「找到 N 个相关文档片段，来自 M 个文件」。 */
export function kbChunkSummary(chunks: KbQueryChunk[]): string {
  if (chunks.length === 0) return '';

  return `找到 ${chunks.length} 个相关文档片段，来自 ${groupChunksByFile(chunks).length} 个文件`;
}
