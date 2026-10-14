/**
 * 会话列表状态。
 *
 * 侧边栏与对话页共用「当前智能体 + 会话列表」：对话页在建线程后把它插进列表，
 * 侧边栏据此高亮与切换，不必为了一个新线程重拉整张列表。
 */
import { create } from 'zustand';

import { agentRunApi, chatThreadApi, type ChatThread } from '../api/agent-api';
import {
  isToolApprovalMode,
  type ToolApprovalMode,
} from '../lib/tool-approval';

/**
 * 列表与智能体解析的请求超时。
 * 这两个请求是页面首屏的必经之路，挂住会让单飞状态永远等下去、界面停在加载中，
 * 因此到点显式失败，让用户看到原因并重试。
 */
const REQUEST_TIMEOUT_MS = 15_000;

/** 默认智能体的在飞请求；侧边栏与对话页同时挂载时只发一次。 */
let agentSlugInFlight: Promise<string | null> | null = null;

/** 首次初始化的在飞请求；侧边栏与对话页同时挂载时只发一轮请求。 */
let initializeInFlight: Promise<void> | null = null;

/** 列表读取的发起序号；用于丢弃被后发请求超越的旧响应。 */
let loadGeneration = 0;

/**
 * 一次拉多少条会话；与参照同值。
 *
 * 后端默认也是 100（`limit` 上限 500），这里显式传，让「加载更多」的页大小只有一个事实源。
 */
export const THREAD_PAGE_SIZE = 100;

/** 置顶的排前面，其余保持后端给的 `updated_at` 倒序。 */
export function sortThreads(threads: ChatThread[]): ChatThread[] {
  return [...threads].sort(
    (left, right) =>
      Number(right.is_pinned ?? false) - Number(left.is_pinned ?? false),
  );
}

/**
 * 会话变更类动作的共用骨架：清错误、调用后端、成功后就地更新、失败时可展示。
 * 返回是否成功，调用方据此决定要不要退出编辑态。
 */
async function runThreadAction(
  action: () => Promise<unknown>,
  set: (partial: Partial<ThreadListState>) => void,
  failureMessage: string,
  apply: (updated: ChatThread) => void,
): Promise<boolean> {
  set({ error: null });
  try {
    const result = (await action()) as ChatThread | undefined;
    apply(result ?? ({} as ChatThread));
    return true;
  } catch (error) {
    console.warn('Thread action failed:', error);
    set({
      error: error instanceof Error ? error.message : failureMessage,
    });
    return false;
  }
}

export type ThreadListState = {
  /** 当前对话页使用的智能体；未解析时为 null。 */
  agentSlug: string | null;
  /**
   * 该智能体配置里的工具审批默认值；未配置时为 null。
   * `tool_approval_mode` 在智能体配置里是 admin 级字段，普通用户看不到，因此这里通常为 null。
   */
  agentToolApprovalMode: ToolApprovalMode | null;
  threads: ChatThread[];
  loading: boolean;
  /** 还有更多会话没拉回来；由「上一页是否装满」推断（后端不返回总数）。 */
  hasMore: boolean;
  /** 正在追加下一页；与首屏 `loading` 分开，避免整列表退回加载态。 */
  loadingMore: boolean;
  /** 加载失败时的可展示原因；UI 必须显示它，而不是停在空白列表。 */
  error: string | null;
  /** 解析默认智能体（在飞请求与结果都只保留一份），返回 slug。 */
  ensureAgentSlug: () => Promise<string | null>;
  /** 切换到指定智能体；只改当前选择，并按其重载会话列表。 */
  selectAgent: (slug: string) => void;
  /** 解析智能体并拉取会话列表；进入页面时调用，加载期间保持 loading。 */
  initialize: () => Promise<void>;
  /** 按指定智能体拉取会话列表；没有智能体时不请求。 */
  load: (agentSlug: string | null) => Promise<void>;
  /** 追加下一页；没有更多或正在追加时是空操作。 */
  loadMore: () => Promise<void>;
  /** 新建线程后插入列表最前，避免再拉一次。 */
  upsert: (thread: ChatThread) => void;
  /** 重命名会话；成功后只改本地那一条。返回是否成功。 */
  rename: (threadId: string, title: string) => Promise<boolean>;
  /** 切换置顶；成功后按置顶优先重排。返回是否成功。 */
  togglePin: (threadId: string) => Promise<boolean>;
  /** 删除会话；成功后从列表移除。返回是否成功。 */
  remove: (threadId: string) => Promise<boolean>;
  /** 标记已查看：后端据此把 `thread_status` 从 ready 收敛为 done。 */
  markViewed: (threadId: string) => Promise<boolean>;
  /** 低频同步线程状态；只合并 `thread_status`，不覆盖本地更新的标题与置顶。 */
  syncStatuses: () => Promise<void>;
  /**
   * 设置线程级工具审批模式：先就地改 metadata，再持久化；失败回滚并留下原因。
   */
  setToolApprovalMode: (
    threadId: string,
    mode: ToolApprovalMode,
  ) => Promise<boolean>;
  /**
   * 就地记下这次下发到后端的模型。
   *
   * 持久化由后端拥有：创建 run 时它会在同一事务里写进会话的 `metadata.model_spec`。这里只让
   * 本地对象跟上，免得用户随后清空选择时回退到一个还没刷新的旧值。列表里没有该会话时是空操作。
   */
  setModelSpec: (threadId: string, modelSpec: string) => void;
};

export const useThreadList = create<ThreadListState>((set, get) => ({
  agentSlug: null,
  agentToolApprovalMode: null,
  threads: [],
  loading: false,
  hasMore: false,
  loadingMore: false,
  error: null,

  selectAgent: (slug) => {
    // 解析默认智能体的在飞结果不再写回：用户刚刚显式选了另一个
    agentSlugInFlight = null;
    set({ agentSlug: slug, error: null });
    void get().load(slug);
  },

  ensureAgentSlug: async () => {
    const current = get().agentSlug;
    if (current) return current;
    if (agentSlugInFlight) return agentSlugInFlight;

    agentSlugInFlight = (async () => {
      try {
        const { agent } = await agentRunApi.getDefaultAgent({
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const slug = agent?.slug ?? null;
        const configured = agent?.config_json?.context?.tool_approval_mode;
        set({
          agentSlug: slug,
          agentToolApprovalMode: isToolApprovalMode(configured)
            ? configured
            : null,
        });
        if (!slug) set({ error: '没有可用的默认智能体。' });
        return slug;
      } catch (error) {
        console.warn('Failed to resolve default agent:', error);
        set({ error: '获取默认智能体失败。' });
        return null;
      } finally {
        agentSlugInFlight = null;
      }
    })();

    return agentSlugInFlight;
  },

  initialize: async () => {
    if (initializeInFlight) return initializeInFlight;

    initializeInFlight = (async () => {
      // 解析智能体也是「首次加载」的一部分：这段时间必须保持 loading，
      // 否则慢网络下会先闪一次「还没有历史会话。」
      set({ loading: true, error: null });
      const slug = get().agentSlug ?? (await get().ensureAgentSlug());
      // 解析失败时保留原因，不去拉一份跨智能体的列表把错误盖掉
      if (!slug) {
        set({ loading: false });
        return;
      }
      await get().load(slug);
    })().finally(() => {
      initializeInFlight = null;
    });

    return initializeInFlight;
  },

  load: async (agentSlug) => {
    if (!agentSlug) return;
    const generation = (loadGeneration += 1);
    set({ loading: true, error: null });
    try {
      const threads = await chatThreadApi.listThreads({
        agentSlug,
        limit: THREAD_PAGE_SIZE,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      // 连续加载会让多个读取并发，只接受最后一次发起的结果
      if (generation !== loadGeneration) return;
      const list = threads ?? [];
      set({
        threads: sortThreads(list),
        loading: false,
        // 后端不返回总数：上一页装满就认为还有下一页
        hasMore: list.length >= THREAD_PAGE_SIZE,
      });
    } catch (error) {
      console.warn('Failed to load threads:', error);
      if (generation !== loadGeneration) return;
      set({
        loading: false,
        error: error instanceof Error ? error.message : '加载会话列表失败。',
      });
    }
  },

  loadMore: async () => {
    const { agentSlug, threads, hasMore, loadingMore } = get();
    if (!agentSlug || !hasMore || loadingMore) return;

    set({ loadingMore: true, error: null });
    try {
      const fetched = await chatThreadApi.listThreads({
        agentSlug,
        limit: THREAD_PAGE_SIZE,
        offset: threads.length,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      // 后端分页会重复返回置顶项，只追加列表里还没有的
      const existing = new Set(get().threads.map((thread) => thread.id));
      const appended = (fetched ?? []).filter(
        (thread) => !existing.has(thread.id),
      );
      set({
        threads: sortThreads([...get().threads, ...appended]),
        loadingMore: false,
        hasMore: appended.length >= THREAD_PAGE_SIZE,
      });
    } catch (error) {
      console.warn('Failed to load more threads:', error);
      set({
        loadingMore: false,
        error: error instanceof Error ? error.message : '加载更多会话失败。',
      });
    }
  },

  rename: async (threadId, title) => {
    const trimmed = title.trim();
    if (!trimmed) {
      set({ error: '标题不能为空。' });
      return false;
    }
    return runThreadAction(
      () => chatThreadApi.updateThread(threadId, { title: trimmed }),
      set,
      '重命名会话失败。',
      (updated) =>
        set((state) => ({
          threads: state.threads.map((item) =>
            item.id === threadId ? { ...item, ...updated } : item,
          ),
        })),
    );
  },

  togglePin: async (threadId) => {
    const current = get().threads.find((item) => item.id === threadId);
    if (!current) return false;
    return runThreadAction(
      () =>
        chatThreadApi.updateThread(threadId, {
          isPinned: !current.is_pinned,
        }),
      set,
      '更新置顶失败。',
      (updated) =>
        set((state) => ({
          threads: sortThreads(
            state.threads.map((item) =>
              item.id === threadId ? { ...item, ...updated } : item,
            ),
          ),
        })),
    );
  },

  markViewed: async (threadId) => {
    try {
      const updated = await chatThreadApi.markViewed(threadId);
      if (updated.thread_status) {
        set((state) => ({
          threads: state.threads.map((item) =>
            item.id === threadId
              ? { ...item, thread_status: updated.thread_status }
              : item,
          ),
        }));
      }
      return true;
    } catch (error) {
      // 已读标记失败不影响阅读本身：保留状态，等下一次同步或下一次打开
      console.warn('Failed to mark thread viewed:', threadId, error);
      return false;
    }
  },

  syncStatuses: async () => {
    const agentSlug = get().agentSlug;
    if (!agentSlug) return;
    try {
      const threads = await chatThreadApi.listThreads({ agentSlug });
      const statusById = new Map(
        threads.map((thread) => [thread.id, thread.thread_status]),
      );
      set((state) => ({
        threads: state.threads.map((item) => {
          const status = statusById.get(item.id);
          // 本地新插入的线程后端可能还没有状态，保持原样
          return status ? { ...item, thread_status: status } : item;
        }),
      }));
    } catch (error) {
      console.warn('Failed to sync thread statuses:', error);
    }
  },

  setModelSpec: (threadId, modelSpec) => {
    if (!get().threads.some((item) => item.id === threadId)) return;

    set((state) => ({
      threads: state.threads.map((item) =>
        item.id === threadId
          ? { ...item, metadata: { ...item.metadata, model_spec: modelSpec } }
          : item,
      ),
    }));
  },

  setToolApprovalMode: async (threadId, mode) => {
    // 会话列表只加载首屏，列表外的线程同样要能保存：没有本地条目时跳过就地更新
    const current = get().threads.find((item) => item.id === threadId);
    const previousMetadata = current?.metadata ?? {};
    const withMode = (metadata: Record<string, unknown>) =>
      set((state) => ({
        threads: state.threads.map((item) =>
          item.id === threadId ? { ...item, metadata } : item,
        ),
      }));

    set({ error: null });
    withMode({ ...previousMetadata, tool_approval_mode: mode });
    try {
      const updated = await chatThreadApi.updateThread(threadId, {
        toolApprovalMode: mode,
      });
      // 与失败分支同一个守卫：期间用户又选过别的模式时，这次响应已经过期
      set((state) => ({
        threads: state.threads.map((item) =>
          item.id === threadId && item.metadata?.tool_approval_mode === mode
            ? {
                ...item,
                metadata: updated.metadata ?? {
                  ...previousMetadata,
                  tool_approval_mode: mode,
                },
              }
            : item,
        ),
      }));
      return true;
    } catch (error) {
      console.warn('Thread action failed:', error);
      set({
        error: error instanceof Error ? error.message : '审批模式保存失败。',
      });
      // 只回滚自己写下的那次值：期间用户又选过别的模式时，那次结果不能被这条旧失败抹掉
      set((state) => ({
        threads: state.threads.map((item) =>
          item.id === threadId && item.metadata?.tool_approval_mode === mode
            ? { ...item, metadata: previousMetadata }
            : item,
        ),
      }));
      return false;
    }
  },

  remove: async (threadId) => {
    return runThreadAction(
      () => chatThreadApi.deleteThread(threadId),
      set,
      '删除会话失败。',
      () =>
        set((state) => ({
          threads: state.threads.filter((item) => item.id !== threadId),
        })),
    );
  },

  upsert: (thread) => {
    const existing = get().threads;
    const known = existing.some((item) => item.id === thread.id);
    const next = known
      ? // 已存在的线程合并字段，不打乱它在列表里的位置，也不丢后端其它字段
        existing.map((item) =>
          item.id === thread.id ? { ...item, ...thread } : item,
        )
      : [thread, ...existing];
    set({ threads: sortThreads(next) });
  },
}));
