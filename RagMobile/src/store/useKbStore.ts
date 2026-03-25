import { create } from 'zustand';
import { api } from '../utils/api';

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
  fetchKnowledgeBases: () => Promise<void>;
  createKnowledgeBase: (name: string, description?: string) => Promise<KnowledgeBase>;
  deleteKnowledgeBase: (id: string) => Promise<void>;
  toggleStar: (id: string) => void;
}

const KB_COLORS = ['#4f7ef8', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899'];

export const useKbStore = create<KbState>((set, get) => ({
  knowledgeBases: [],
  loading: false,

  fetchKnowledgeBases: async () => {
    set({ loading: true });
    try {
      const res = await api.get('/api/knowledge-bases');
      const list: KnowledgeBase[] = (res.data?.knowledge_bases ?? res.data ?? []).map(
        (kb: any, i: number) => ({ ...kb, color: kb.color ?? KB_COLORS[i % KB_COLORS.length] })
      );
      set({ knowledgeBases: list });
    } catch {
      set({ knowledgeBases: [] });
    } finally {
      set({ loading: false });
    }
  },

  createKnowledgeBase: async (name, description = '') => {
    const res = await api.post('/api/knowledge-bases', { name, description });
    const kb: KnowledgeBase = {
      ...res.data,
      color: KB_COLORS[get().knowledgeBases.length % KB_COLORS.length],
    };
    set(state => ({ knowledgeBases: [kb, ...state.knowledgeBases] }));
    return kb;
  },

  deleteKnowledgeBase: async (id) => {
    await api.delete(`/api/knowledge-bases/${id}`);
    set(state => ({ knowledgeBases: state.knowledgeBases.filter(kb => kb.id !== id) }));
  },

  toggleStar: (id) => {
    set(state => ({
      knowledgeBases: state.knowledgeBases.map(kb =>
        kb.id === id ? { ...kb, is_starred: !kb.is_starred } : kb
      ),
    }));
  },
}));
