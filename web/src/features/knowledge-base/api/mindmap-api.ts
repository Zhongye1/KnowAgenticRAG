/**
 * 知识导图接口。
 *
 * 契约：`backend/server/routers/knowledge_router.py` 的 `mindmap` 四个端点里，这个分区只用三个
 * （取导图 / 生成 / 差异检测），响应类型按 `ars/knowledge/utils/mindmap_utils.py` 手写：
 * `mindmap` 是 `{content, children}` 的树，`diff` 给出新增/删除文件与 `needs_update`。
 * `mindmap/files` 与 `mindmap/databases` 这个分区用不到（生成时传空 `file_ids` 表示全部文件），
 * 因此不在这里出现。
 */
import {
  generateMindmapApiKnowledgeDatabasesKbIdMindmapGeneratePost,
  getDatabaseMindmapApiKnowledgeDatabasesKbIdMindmapGet,
  getMindmapDiffRouteApiKnowledgeDatabasesKbIdMindmapDiffGet,
} from '@/shared/api/generated/sdk.gen';
import { unwrap } from '@/shared/api';

/** 导图节点：后端存的就是这棵树，叶子是文件名。 */
export type MindmapNode = {
  content: string;
  children?: MindmapNode[] | null;
};

/** 差异检测结果（`compute_mindmap_changes`）。 */
export type MindmapDiff = {
  has_mindmap: boolean;
  tracked_files: string[];
  current_files: string[];
  added_files: Array<{ file_id: string; filename: string; type?: string }>;
  removed_file_ids: string[];
  unchanged_count: number;
  needs_update: boolean;
};

export type MindmapDocument = {
  mindmap: MindmapNode | null;
  kb_id: string;
  db_name?: string;
};

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

  /** 差异检测：与已记录的文件集合比，得出新增/删除与是否需要更新。 */
  async getDiff(kbId: string): Promise<MindmapDiff> {
    return unwrap<MindmapDiff>(
      await getMindmapDiffRouteApiKnowledgeDatabasesKbIdMindmapDiffGet({
        path: { kb_id: kbId },
      }),
    );
  },
};
