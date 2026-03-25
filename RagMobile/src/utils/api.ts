import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// 默认指向本地后端，可通过环境变量或 app.config.js 覆盖
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// 请求拦截：自动注入 JWT
api.interceptors.request.use(async (config) => {
  try {
    const token = await SecureStore.getItemAsync('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch { /* 忽略 */ }
  return config;
});

// 响应拦截：401 清理 token
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync('auth_token');
    }
    return Promise.reject(error);
  }
);

/**
 * SSE 流式请求工具
 * 后端 Content-Type: text/event-stream 或 application/x-ndjson
 */
export async function streamRequest(
  path: string,
  body: Record<string, unknown>,
  onChunk: (text: string) => void,
  onDone?: () => void,
  onError?: (e: Error) => void
) {
  let token: string | null = null;
  try { token = await SecureStore.getItemAsync('auth_token'); } catch { /* 忽略 */ }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const msg = await response.text().catch(() => `HTTP ${response.status}`);
      throw new Error(msg);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('ReadableStream 不可用');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') continue;
          try {
            const json = JSON.parse(raw);
            const text =
              json.choices?.[0]?.delta?.content ??
              json.content ??
              json.text ??
              json.answer ??
              '';
            if (text) onChunk(text);
          } catch {
            // 非 JSON 行直接当文本输出
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
