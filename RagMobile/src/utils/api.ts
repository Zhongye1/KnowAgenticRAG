import axios from "axios";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

// 默认指向本地后端，可通过环境变量或 app.json extra.apiUrl 覆盖
export const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (global as any)?.expo?.constants?.manifest?.extra?.apiUrl ??
  "http://10.0.2.2:8000"; // Android 模拟器默认走宿主机

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

// ── 请求拦截：自动注入 JWT ────────────────────────────────────
api.interceptors.request.use(async (config) => {
  try {
    const token = await SecureStore.getItemAsync("auth_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {
    /* 忽略 */
  }
  return config;
});

// ── 响应拦截：401 清理 token ──────────────────────────────────
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync("auth_token");
    }
    return Promise.reject(error);
  },
);

// ─── AsyncStorage 缓存工具 ────────────────────────────────────
const CACHE_PREFIX = "ragf_cache_";

/**
 * 带 AsyncStorage 本地缓存的 GET 请求
 * - 优先返回缓存（如未过期），同时后台刷新
 * - ttl: 缓存有效期（秒），默认 5 分钟
 */
export async function cachedGet<T = any>(
  path: string,
  ttl: number = 300,
  onUpdate?: (data: T) => void,
): Promise<T | null> {
  const key = CACHE_PREFIX + path.replace(/\//g, "_");
  try {
    // 1. 读缓存
    const cached = await AsyncStorage.getItem(key);
    if (cached) {
      const { data, ts } = JSON.parse(cached);
      const age = (Date.now() - ts) / 1000;
      if (age < ttl) {
        // 缓存有效，后台静默刷新
        _refreshCache(path, key, onUpdate);
        return data as T;
      }
    }
    // 2. 缓存过期或不存在：直接请求
    const res = await api.get<T>(path);
    await AsyncStorage.setItem(
      key,
      JSON.stringify({ data: res.data, ts: Date.now() }),
    );
    return res.data;
  } catch {
    // 网络失败：尽量返回旧缓存
    try {
      const stale = await AsyncStorage.getItem(key);
      if (stale) return JSON.parse(stale).data as T;
    } catch {}
    return null;
  }
}

async function _refreshCache<T>(
  path: string,
  key: string,
  onUpdate?: (data: T) => void,
) {
  try {
    const res = await api.get<T>(path);
    await AsyncStorage.setItem(
      key,
      JSON.stringify({ data: res.data, ts: Date.now() }),
    );
    onUpdate?.(res.data);
  } catch {}
}

/** 清空指定路径的缓存 */
export async function invalidateCache(path: string) {
  const key = CACHE_PREFIX + path.replace(/\//g, "_");
  await AsyncStorage.removeItem(key).catch(() => {});
}

/** 清空所有 ragf 缓存 */
export async function clearAllCache() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ragfKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX));
    await AsyncStorage.multiRemove(ragfKeys);
  } catch {}
}

// ─── 向量/文档片段本地缓存（知识库搜索加速）────────────────────
const FRAG_CACHE_KEY = "ragf_frags_";

export async function cacheFragments(kbId: string, frags: any[]) {
  await AsyncStorage.setItem(
    FRAG_CACHE_KEY + kbId,
    JSON.stringify({ frags, ts: Date.now() }),
  ).catch(() => {});
}

export async function getCachedFragments(
  kbId: string,
  ttl = 3600,
): Promise<any[] | null> {
  try {
    const raw = await AsyncStorage.getItem(FRAG_CACHE_KEY + kbId);
    if (!raw) return null;
    const { frags, ts } = JSON.parse(raw);
    if ((Date.now() - ts) / 1000 < ttl) return frags;
  } catch {}
  return null;
}

/**
 * SSE 流式请求工具
 * 后端 Content-Type: text/event-stream
 */
export async function streamRequest(
  path: string,
  body: Record<string, unknown>,
  onChunk: (text: string) => void,
  onDone?: () => void,
  onError?: (e: Error) => void,
) {
  let token: string | null = null;
  try {
    token = await SecureStore.getItemAsync("auth_token");
  } catch {
    /* 忽略 */
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const msg = await response.text().catch(() => `HTTP ${response.status}`);
      throw new Error(msg);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("ReadableStream 不可用");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") continue;
          try {
            const json = JSON.parse(raw);
            const text =
              json.choices?.[0]?.delta?.content ??
              json.content ??
              json.text ??
              json.answer ??
              "";
            if (text) onChunk(text);
          } catch {
            if (raw) onChunk(raw);
          }
        }
      }
    }

    onDone?.();
  } catch (e) {
    onError?.(e as Error);
  }
}

// ─── 后端 API 端点常量（对齐 RAGBackend/main.py）──────────────
export const ENDPOINTS = {
  // 用户
  login: "/api/user/login",
  register: "/api/user/register",
  userMe: "/api/user/me",

  // 知识库
  kbList: "/api/knowledge-bases",
  kbCreate: "/api/create-knowledgebase/",
  kbDelete: (id: string) => `/api/delete-knowledgebase/${id}`,
  kbDocs: (kbId: string) => `/api/knowledge-bases/${kbId}/documents`,

  // 对话 (chat_send.py → /api/chat/send)
  chatSend: "/api/chat/send",

  // RAG (RAG_app.py → /api/RAG/query)
  ragQuery: "/api/RAG/query",

  // Agent (agent_advanced.py → /api/agent/task)
  agentTask: "/api/agent/task",

  // 语音 (whisper_asr.py → /api/voice/transcribe)
  voiceTranscribe: "/api/voice/transcribe",

  // 知识广场
  squareKbs: "/api/square/kbs",
  squareCircles: "/api/square/circles",
  squareMyKbs: "/api/square/my-kbs",
  squareMyCircles: "/api/square/my-circles",

  // 用户模型配置
  modelConfig: "/api/user-model-config",
};
