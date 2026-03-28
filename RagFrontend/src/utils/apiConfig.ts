// API 配置文件，集中管理所有 API 端点
// 避免硬编码 URL，便于统一管理和修改

// 基础 URL 后端服务的api
const BASE_URL = 'http://localhost:8000';

// API 端点配置
export const API_ENDPOINTS = {
  // 基础 URL
  BASE_URL,

  // 用户相关
  USER: {
    AVATAR: (avatarPath: string) => `${BASE_URL}${avatarPath}`
  },

  // 文件管理相关
  FILES: {
    ALL_DOCUMENTS: `${BASE_URL}/api/files/api/all-documents/`,
    DOCUMENT_PREVIEW: (filePath: string) => `${BASE_URL}/api/files/api/document/preview/?file_path=${encodeURIComponent(filePath)}`,
    DELETE_DOCUMENT: (filePath: string) => `${BASE_URL}/api/files/api/document/?file_path=${encodeURIComponent(filePath)}`
  },

  // 知识库相关
  KNOWLEDGE: {
    GET_ITEM: (id: string) => `${BASE_URL}/api/get-knowledge-item/${id}/`,
    DOCUMENTS_LIST: (id: string) => `${BASE_URL}/api/documents-list/${id}/`,
    // LangChain RAG
    INGEST: `${BASE_URL}/api/RAG/ingest`,
    QUERY: `${BASE_URL}/api/RAG/RAG_query`,
    // 原生 RAG（不依赖 LangChain）
    NATIVE_INGEST: `${BASE_URL}/api/RAG/native_ingest`,
    NATIVE_QUERY: `${BASE_URL}/api/RAG/native_query`,
  },

  // 知识图谱相关
  KNOWLEDGE_GRAPH: {
    PROCESS_ALL_FILES: `${BASE_URL}/api/kg/process-all-files`,
    PROCESS_KNOWLEDGE_BASE: `${BASE_URL}/api/kg/process-knowledge-base`,
    // 新增
    GET_MERGED_GRAPH: (kbId: string) => `${BASE_URL}/api/kg/get-kb-merged-graph/${kbId}`,
    SEARCH_NODES: (kbId: string, keyword: string) =>
      `${BASE_URL}/api/kg/search-nodes/${kbId}?keyword=${encodeURIComponent(keyword)}`,
    GRAPH_STATS: (kbId: string) => `${BASE_URL}/api/kg/graph-stats/${kbId}`,
    GET_KB_FILE_GRAPH: (kbId: string, filename: string) =>
      `${BASE_URL}/api/kg/get-kb-graph-data/${kbId}/${encodeURIComponent(filename)}`,
  },

  // Ollama 模型相关
  OLLAMA: {
    MODELS: `${BASE_URL}/api/ollama-models`,
    BASE: 'http://localhost:11434', // 默认Ollama服务器地址
    TAGS: '/api/tags',
    DELETE: '/api/delete',
    PULL: '/api/pull',
    COPY: '/api/copy'
  },

  // 聊天相关
  CHAT: {
    BASE: `${BASE_URL}/api/chat`,
    SEND_MESSAGE: `${BASE_URL}/api/chat/send-message`,
    SESSIONS: `${BASE_URL}/api/chat/chat-documents`,
    SAVE_SESSION: `${BASE_URL}/api/chat/save-session`,
    DELETE_SESSION: `${BASE_URL}/api/chat/delete-session`,
    DOWNLOAD_CHAT: `${BASE_URL}/api/chat/download-chat-json`

  },

};

export default API_ENDPOINTS;


