import { create } from "zustand";
import { api, cachedGet, invalidateCache } from "../utils/api";

export interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  doc_count?: number;
  color?: string;
  is_starred?: boolean;
  updated_at?: string;
}

interface KbState {
  knowledgeBases: KnowledgeBase[];
  loading: boolean;
  fetchKnowledgeBases: (forceRefresh?: boolean) => Promise<void>;
  createKnowledgeBase: (
    name: string,
    description?: string,
  ) => Promise<KnowledgeBase>;
  deleteKnowledgeBase: (id: string) => Promise<void>;
  toggleStar: (id: string) => void;
}

const KB_COLORS = [
  "#4f7ef8",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
];
const KB_LIST_PATH = "/api/knowledge-bases";

export const useKbStore = create<KbState>((set, get) => ({
  knowledgeBases: [],
  loading: false,

  fetchKnowledgeBases: async (forceRefresh = false) => {
    set({ loading: true });
    try {
      // 使用 AsyncStorage 缓存，5 分钟 TTL；forceRefresh 时绕过缓存
      const ttl = forceRefresh ? 0 : 300;
      const data = await cachedGet<any>(KB_LIST_PATH, ttl, (fresh) => {
        // 后台刷新完成后自动更新 store
        const list = mapKbList(fresh);
        set({ knowledgeBases: list });
      });
      if (data) {
        set({ knowledgeBases: mapKbList(data) });
      }
    } catch {
      set({ knowledgeBases: [] });
    } finally {
      set({ loading: false });
    }
  },

  createKnowledgeBase: async (name, description = "") => {
    const res = await api.post("/api/knowledge-bases", { name, description });
    const kb: KnowledgeBase = {
      ...res.data,
      color: KB_COLORS[get().knowledgeBases.length % KB_COLORS.length],
    };
    set((state) => ({ knowledgeBases: [kb, ...state.knowledgeBases] }));
    // 清缓存，下次拉取最新
    await invalidateCache(KB_LIST_PATH);
    return kb;
  },

  deleteKnowledgeBase: async (id) => {
    await api.delete(`/api/knowledge-bases/${id}`);
    set((state) => ({
      knowledgeBases: state.knowledgeBases.filter((kb) => kb.id !== id),
    }));
    await invalidateCache(KB_LIST_PATH);
  },

  toggleStar: (id) => {
    set((state) => ({
      knowledgeBases: state.knowledgeBases.map((kb) =>
        kb.id === id ? { ...kb, is_starred: !kb.is_starred } : kb,
      ),
    }));
  },
}));

function mapKbList(data: any): KnowledgeBase[] {
  const raw: any[] = data?.knowledge_bases ?? data ?? [];
  return raw.map((kb: any, i: number) => ({
    ...kb,
    color: kb.color ?? KB_COLORS[i % KB_COLORS.length],
  }));
}
