/**
 * 知识导图接口。
 *
 * 契约：`backend/server/routers/knowledge_router.py` 的 `mindmap` 四个端点里，这个分区只用三个
 * （取导图 / 生成 / 差异检测）；这些端点在契约里已声明响应模型，差异检测直接复用生成的
 * `MindmapDiffResponse`。契约把 `mindmap` 本身声明为自由 map（`{[key: string]: unknown}`），
 * 拿不到 `{content, children}` 的树形，因此导图节点的窄投影仍按 `mindmap_utils.py` 手写。
 *
 * `mindmap/files` 与 `mindmap/databases` 这个分区用不到（生成时传空 `file_ids` 表示全部文件），
 * 因此不在这里出现。
 */
import {
  generateMindmapApiKnowledgeDatabasesKbIdMindmapGeneratePost,
  getDatabaseMindmapApiKnowledgeDatabasesKbIdMindmapGet,
  getMindmapDiffRouteApiKnowledgeDatabasesKbIdMindmapDiffGet,
} from '@/shared/api/generated/sdk.gen';
import type { MindmapDiffResponse } from '@/shared/api/generated/types.gen';
import { unwrap } from '@/shared/api';

/**
 * 导图节点：后端存的就是这棵树，叶子是文件名；保留手写。
 *
 * 契约的 `MindmapDetailResponse.mindmap` / `MindmapGenerateResponse.mindmap` 是
 * `{[key: string]: unknown}`，递归的 `{content, children}` 形状没有进契约，UI 继续拥有它。
 */
export type MindmapNode = {
  content: string;
  children?: MindmapNode[] | null;
};

/**
 * 差异检测结果；保留手写。
 *
 * 端点的响应体由契约生成的 `MindmapDiffResponse` 拥有（`getDiff` 直接读它），但这里保留一份
 * 调用方投影：`mindmap-view.test.ts` 与 `mindmap-view.ts` 按 `needs_update` / `added_files` /
 * `removed_file_ids` 等基础字段构造与消费，生成模型多出的必填键（`kb_id`/`slug`/`message` 等）
 * 会要求补齐所有构造点。
 */
export type MindmapDiff = {
  has_mindmap: boolean;
  tracked_files: string[];
  current_files: string[];
  added_files: Array<{ file_id: string; filename: string; type?: string }>;
  removed_file_ids: string[];
  unchanged_count: number;
  needs_update: boolean;
};

/** 当前导图；保留手写（`mindmap` 用上面的窄树形，`kb_id` 缺失时调用方回落）。 */
export type MindmapDocument = {
  mindmap: MindmapNode | null;
  kb_id: string;
  db_name?: string;
};

/** 生成结果；保留手写（`mindmap` 同窄树形）。 */
export type MindmapGeneration = {
  mindmap: MindmapNode | null;
  /** 后端在增量更新时若没有新增文件，会跳过 AI 调用。 */
  no_ai_needed?: boolean;
};

export const mindmapApi = {
  /**
   * 取当前知识库的导图；后端在「还没生成」时返回 `mindmap: null`（不是错误）。
   *
   * 只把**成功响应的 null** 当空态：
   * 知识库不存在之类的 404 是真故障，让它照常抛出来，不在界面上伪装成「去生成一张」。
   */
  async getDocument(kbId: string): Promise<MindmapDocument> {
    const result = unwrap<Partial<MindmapDocument>>(
      await getDatabaseMindmapApiKnowledgeDatabasesKbIdMindmapGet({
        path: { kb_id: kbId },
      }),
    );
    return {
      mindmap: result.mindmap ?? null,
      kb_id: result.kb_id ?? kbId,
      db_name: result.db_name,
    };
  },

  /** 生成导图；`incremental` 为真时走后端的增量分支（可能不调用 AI）。 */
  async generate(
    kbId: string,
    options: { incremental?: boolean; userPrompt?: string } = {},
  ): Promise<MindmapGeneration> {
    const result = unwrap<Partial<MindmapGeneration>>(
      await generateMindmapApiKnowledgeDatabasesKbIdMindmapGeneratePost({
        path: { kb_id: kbId },
        body: {
          file_ids: [],
          user_prompt: options.userPrompt ?? '',
          incremental: options.incremental ?? false,
        },
      }),
    );
    return {
      mindmap: result.mindmap ?? null,
      no_ai_needed: result.no_ai_needed,
    };
  },

  /** 差异检测：与已记录的文件集合比，得出新增/删除与是否需要更新；响应是契约生成的 `MindmapDiffResponse`。 */
  async getDiff(kbId: string): Promise<MindmapDiff> {
    return unwrap<MindmapDiffResponse>(
      await getMindmapDiffRouteApiKnowledgeDatabasesKbIdMindmapDiffGet({
        path: { kb_id: kbId },
      }),
    );
  },
};
