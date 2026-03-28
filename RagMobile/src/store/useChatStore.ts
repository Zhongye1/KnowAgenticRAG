import { create } from 'zustand';
import { streamRequest } from '../utils/api';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: { title: string; score?: number }[];
  streaming?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  messages: Message[];
}

interface ChatState {
  sessions: ChatSession[];
  currentSessionId: string | null;
  messages: Message[];
  streaming: boolean;
  createSession: () => string;
  setCurrentSession: (id: string) => void;
  sendMessage: (text: string, kbId?: string) => Promise<void>;
  clearMessages: () => void;
}

let _sessionCounter = 1;

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  currentSessionId: null,
  messages: [],
  streaming: false,

  createSession: () => {
    const id = `session_${Date.now()}_${_sessionCounter++}`;
    const session: ChatSession = {
      id,
      title: `对话 ${_sessionCounter}`,
      createdAt: Date.now(),
      messages: [],
    };
    set(state => ({
      sessions: [session, ...state.sessions],
      currentSessionId: id,
      messages: [],
    }));
    return id;
  },

  setCurrentSession: (id) => {
    const session = get().sessions.find(s => s.id === id);
    set({ currentSessionId: id, messages: session?.messages ?? [] });
  },

  clearMessages: () => {
    set({ messages: [] });
  },

  sendMessage: async (text, kbId) => {
    const userMsg: Message = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content: text,
    };
    const assistantMsg: Message = {
      id: `msg_${Date.now()}_ai`,
      role: 'assistant',
      content: '',
      streaming: true,
    };

    set(state => ({ messages: [...state.messages, userMsg, assistantMsg], streaming: true }));

    const endpoint = kbId ? '/api/rag/chat-stream' : '/api/chat/stream';
    const body = kbId
      ? { query: text, kb_id: kbId, stream: true }
      : { messages: [...get().messages.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
                    { role: 'user', content: text }], stream: true };

    let aiContent = '';

    await streamRequest(
      endpoint,
      body,
      (chunk) => {
        aiContent += chunk;
        set(state => ({
          messages: state.messages.map(m =>
            m.id === assistantMsg.id ? { ...m, content: aiContent, streaming: true } : m
          ),
        }));
      },
      () => {
        set(state => ({
          messages: state.messages.map(m =>
            m.id === assistantMsg.id ? { ...m, streaming: false } : m
          ),
          streaming: false,
        }));
        // 更新 session 历史
        const { currentSessionId, messages } = get();
        if (currentSessionId) {
          set(state => ({
            sessions: state.sessions.map(s =>
              s.id === currentSessionId ? { ...s, messages } : s
            ),
          }));
        }
      },
      (err) => {
        const errText = `请求失败：${err.message}`;
        set(state => ({
          messages: state.messages.map(m =>
            m.id === assistantMsg.id ? { ...m, content: errText, streaming: false } : m
          ),
          streaming: false,
        }));
      }
    );
  },
}));
