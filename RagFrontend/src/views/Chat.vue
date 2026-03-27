<template>
  <div class="chat-page-root">
    <!-- 侧边栏：对话历史记录 -->
    <div class="chat-sidebar">
      <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <h2 class="font-medium text-gray-900 dark:text-white">对话历史</h2>

        <button
          class="text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
          @click="showOllamaSettings" :disabled="loading">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </button>
      </div>

      <!-- 加载状态 -->
      <div v-if="loading && chatSessions.length === 0" class="sidebar-loading">
        <div class="text-center">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p class="text-sm text-gray-500 dark:text-gray-400">加载对话历史...</p>
        </div>
      </div>

      <!-- 会话列表 -->
      <div v-else class="sidebar-sessions">
        <div v-for="(chat, idx) in chatSessions" :key="chat.id" @click="selectSession(idx)" :class="[
          'px-3 py-2 rounded-md cursor-pointer flex items-center transition-colors duration-200 group',
          currentSessionIndex === idx
            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
            : 'hover:bg-gray-100 text-gray-800 dark:hover:bg-gray-700 dark:text-gray-200',
        ]">
          <div
            class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center mr-3 flex-shrink-0">
            <span class="text-xs font-medium text-white">{{ idx + 1 }}</span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium truncate">{{ chat.title || "新对话" }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 truncate">
              {{ chat.lastMessage || "开始新对话..." }}
            </div>
            <div class="text-xs text-gray-400 dark:text-gray-500">
              {{ formatDateTime(chat.created_at) }}
            </div>
          </div>
          <!-- 删除按钮 -->
          <button @click.stop="deleteSession(idx)"
            class="opacity-0 group-hover:opacity-100 ml-2 p-1 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-opacity"
            :disabled="chatSessions.length <= 1">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24"
              stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      <!-- RAG 模式区域 -->
      <div class="rag-panel">
        <!-- 当前模型徽章 + 去设置的快捷入口 -->
        <div class="current-model-bar" @click="router.push('/settings')" title="点击前往设置页修改模型">
          <span class="current-model-dot"></span>
          <span class="current-model-name">{{ currentOllamaModel }}</span>
          <span class="current-model-goto">⚙ 配置</span>
        </div>
        <!-- 模型选择器 -->
        <div class="rag-toggle-row" style="border-bottom:none; padding-bottom:4px;">
          <div class="rag-toggle-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
              <path stroke-linecap="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v3"/>
            </svg>
            <span style="font-size:12px;">模型</span>
          </div>
          <ModelSelector v-model="selectedModel" />
        </div>
        <!-- 检索策略（RAG 模式下显示） -->
        <div v-if="ragMode" class="rag-toggle-row" style="border-top:none; padding-top:2px;">
          <div class="rag-toggle-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
              <path stroke-linecap="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"/>
            </svg>
            <span style="font-size:12px;">检索策略</span>
          </div>
          <RetrievalConfig v-model="retrievalConfig" />
        </div>
        <!-- RAG 模式开关 -->
        <div class="rag-toggle-row">
          <div class="rag-toggle-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
            </svg>
            <span>知识库问答</span>
          </div>
          <t-switch v-model="ragMode" size="small" />
        </div>

        <!-- 知识库选择器（RAG模式下展示） -->
        <div v-if="ragMode" class="rag-kb-selector">
          <div class="rag-kb-label">选择知识库</div>
          <t-select
            v-model="selectedKbId"
            placeholder="请选择知识库"
            size="small"
            clearable
            :options="kbSelectOptions"
            class="rag-kb-select"
          />
          <div v-if="selectedKbId" class="rag-kb-hint">
            <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2">
              <path stroke-linecap="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            已启用知识库增强
          </div>
        </div>
      </div>

      <!-- 底部操作按钮 -->
      <div class="p-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
        <button @click="createNewSession" :disabled="loading"
          class="w-full flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24"
            stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          新对话
        </button>
        <button @click="showOllamaSettings" :disabled="loading"
          class="w-full flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-blue-300 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          ollama服务设置
        </button>
        <button @click="refreshSessions" :disabled="loading"
          class="w-full flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" :class="{ 'animate-spin': loading }" fill="none"
            viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          刷新
        </button>
      </div>
    </div>

    <!-- 主聊天区域 -->
    <div class="chat-main-area">
      <!-- 停止提示 -->
      <div v-if="showStopHint"
        class="absolute top-4 right-4 bg-yellow-100 border border-yellow-300 text-yellow-800 px-4 py-2 rounded-md shadow-md z-50 animate-fade-in">
        已停止生成
      </div>

      <chatMainUnit v-if="currentSession" :history="currentSession.history" :title="currentSession.title"
        :lastMessage="currentSession.lastMessage" :key="currentSession.id" :loading="isStreamLoad"
        :ragMode="ragMode" :ragKbId="selectedKbId"
        @chat-updated="handleChatUpdated" @send-message="inputEnter" />

      <!-- 无会话状态 -->
      <div v-else class="flex-1 flex items-center justify-center">
        <div class="text-center">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">暂无对话</h3>
          <p class="text-gray-500 dark:text-gray-400 mb-4">点击"新对话"开始聊天</p>
          <button @click="createNewSession" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
            开始新对话
          </button>
        </div>
      </div>
    </div>

    <!-- Ollama设置对话框 -->
    <!-- Ollama设置抽屉 -->
    <t-drawer header="Ollama 设置" :visible="showSettingsDialog" placement="right" :onConfirm="confirmSettings"
      :onCancel="closeSettingsDialog" :onClose="closeSettingsDialog" size="500px">
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">服务器地址</label>
          <t-input v-model="settings.serverUrl" placeholder="http://localhost:11434" />
          <p class="text-xs text-gray-500 mt-1">本地模型则为: http://localhost:11434</p>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">连接超时（秒）</label>
          <t-input-number v-model="settings.timeout" :min="1" :max="300" />
        </div>
      </div>
    </t-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch, reactive, onMounted } from "vue";
import chatMainUnit from "../components/chat-main-unit/chat-main-unit.vue";
import ModelSelector from "../components/ModelSelector.vue";
import RetrievalConfig from "../components/RetrievalConfig.vue";
import type { RetrievalConfig as RetrievalConfigType } from "../components/RetrievalConfig.vue";
import { useRouter, useRoute } from "vue-router";
import { MessagePlugin } from "tdesign-vue-next";
import axios from "axios";



// 接口定义
interface ChatMessage {
  avatar: string;
  name: string;
  datetime: string;
  content: string;
  role: "user" | "assistant";
  reasoning?: string;
  duration?: number;
  sources?: SourceItem[];
}

interface SourceItem {
  filename: string;
  content: string;
  score?: number;
}

interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  history: ChatMessage[];
  created_at: number;
  updated_at?: number;
}

const router = useRouter();
const route = useRoute();

// 响应式状态
const loading = ref(false);
const isStreamLoad = ref(false);
const currentSessionIndex = ref(0);
const showStopHint = ref(false);
const retryCount = ref(0);
const maxRetries = 3;

// 聊天会话数据
const chatSessions = ref<ChatSession[]>([]);

// ====== RAG 模式 ======
const ragMode = ref(false);
const selectedKbId = ref<string>('');
const kbList = ref<any[]>([]);

// ====== 多模型 & 检索策略 ======
const selectedModel = ref(localStorage.getItem('selected_model') || 'qwen2:0.5b');
const retrievalConfig = ref<RetrievalConfigType>({
  strategy: 'rrf', topK: 6, scoreThreshold: 0.3,
  vectorWeight: 0.6, bm25Weight: 0.4, rerank: false, rerankTopN: 3,
});
watch(selectedModel, (v) => localStorage.setItem('selected_model', v));

// ====== 当前生效的 Ollama 模型（从后端拉，优先展示用户配置的） ======
const currentOllamaModel = ref(localStorage.getItem('selected_model') || 'qwen2:0.5b')
async function syncCurrentOllamaModel() {
  try {
    const res = await import('axios').then(m => m.default.get('/api/user-model-config'))
    const model = res.data?.config?.llm_model
    if (model) {
      currentOllamaModel.value = model
      selectedModel.value = model
      localStorage.setItem('selected_model', model)
    }
  } catch { /* 后端未运行时静默 */ }
}

const kbSelectOptions = computed(() =>
  kbList.value.map((kb: any) => ({
    label: kb.kbName || kb.title || kb.name,
    value: kb.kbId || kb.id,
  }))
);

const loadKbList = async () => {
  try {
    const res = await axios.get('/api/get-knowledge-item/');
    const data = res.data?.data || res.data || [];
    kbList.value = Array.isArray(data) ? data : [];
  } catch { kbList.value = []; }
};

// 计算属性
const currentSession = computed(() => {
  return chatSessions.value[currentSessionIndex.value];
});

// Ollama设置对话框相关
const showSettingsDialog = ref(false);
const settings = reactive({
  serverUrl: 'http://localhost:11434',
  timeout: 30
});

// 显示Ollama设置对话框
const showOllamaSettings = () => {
  loadSettings();
  showSettingsDialog.value = true;
};

// 关闭设置对话框
const closeSettingsDialog = () => {
  showSettingsDialog.value = false;
};

// 确认设置
const confirmSettings = () => {
  saveSettings();
  closeSettingsDialog();
};

// 保存设置
const saveSettings = () => {
  const settingsToSave = {
    serverUrl: settings.serverUrl,
    timeout: settings.timeout
  };

  localStorage.setItem('ollamaSettings', JSON.stringify(settingsToSave));
  MessagePlugin.success('设置已保存');

  // 发送事件通知其他组件设置已更新
  window.dispatchEvent(new CustomEvent('ollamaSettingsUpdated', {
    detail: settingsToSave
  }));

  // 添加页面刷新逻辑
  setTimeout(() => {
    window.location.reload();
  }, 100);
};

// 加载设置
const loadSettings = () => {
  const savedSettings = localStorage.getItem('ollamaSettings');
  if (savedSettings) {
    try {
      const parsedSettings = JSON.parse(savedSettings);
      settings.serverUrl = parsedSettings.serverUrl || 'http://localhost:11434';
      settings.timeout = parsedSettings.timeout || 30;
    } catch (e) {
      console.error('加载设置失败:', e);
      MessagePlugin.error('加载设置失败');
    }
  }
};

// 组件挂载时加载设置
onMounted(() => {
  loadSettings();
});

// API 配置
const API_BASE = "/api/chat";
const API_ENDPOINTS = {
  SESSIONS: `${API_BASE}/chat-documents`,
  SAVE_SESSION: `${API_BASE}/save-session`,
  DELETE_SESSION: `${API_BASE}/delete-session`,
  DOWNLOAD: `${API_BASE}/download-chat-json`,
  SEND_MESSAGE: `${API_BASE}/send-message`,
};

// 工具函数
const generateNumericUUID = (length = 16): string => {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += Math.floor(Math.random() * 10);
  }
  return result;
};

const formatDateTime = (timestamp: number): string => {
  if (!timestamp) return "";
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffTime = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  } else if (diffDays === 1) {
    return "昨天";
  } else if (diffDays < 7) {
    return `${diffDays}天前`;
  } else {
    return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  }
};

// API 请求封装
const apiRequest = async (url: string, options: RequestInit = {}) => {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
};

// 获取会话历史数据
const fetchChatSessions = async (): Promise<boolean> => {
  try {
    loading.value = true;
    retryCount.value = 0;

    console.log("开始获取会话历史...");
    const data = await apiRequest(API_ENDPOINTS.SESSIONS);

    // 数据处理和验证
    const sessions = Array.isArray(data) ? data : [];
    chatSessions.value = sessions
      .map((session) => ({
        ...session,
        id: session.id || generateNumericUUID(),
        title: session.history[1]
          ? session.history[1].content.slice(0, 5) + "..."
          : "新对话",
        lastMessage: session.history[session.history.length - 1]
          ? session.history[session.history.length - 1].content.slice(0, 10) + "..."
          : "空",
        history: session.history || [],
        created_at: session.created_at || Date.now() / 1000,
      }))
      .sort((a, b) => (b.updated_at || b.created_at) - (a.updated_at || a.created_at));
    console.log(chatSessions.value);
    console.log(`会话历史加载成功: ${chatSessions.value.length} 个会话`);
    return true;
  } catch (error) {
    console.error("获取会话历史失败:", error);

    if (retryCount.value < maxRetries) {
      retryCount.value++;
      MessagePlugin.warning(`获取失败，正在重试 (${retryCount.value}/${maxRetries})...`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount.value));
      return fetchChatSessions();
    } else {
      MessagePlugin.error("获取会话历史失败，请刷新页面重试");
      // 创建默认会话
      await createDefaultSession();
      return false;
    }
  } finally {
    loading.value = false;
  }
};

// 创建默认会话
const createDefaultSession = async () => {
  const defaultSession: ChatSession = {
    id: generateNumericUUID(),
    title: "新对话",
    lastMessage: "",
    history: [],
    created_at: Date.now() / 1000,
  };

  chatSessions.value = [defaultSession];
  currentSessionIndex.value = 0;
};

// 创建新会话
const createNewSession = async () => {
  try {
    const newSession: ChatSession = {
      id: generateNumericUUID(),
      title: "新对话",
      lastMessage: "",
      history: [],
      created_at: Date.now() / 1000,
    };

    // 立即保存新会话到后端
    await saveChatSession(newSession);

    // 添加到本地状态（置顶）
    chatSessions.value.unshift(newSession);

    // 切换到新会话
    currentSessionIndex.value = 0;

    // 更新路由
    await router.push(`/chat/${newSession.id}`);

    MessagePlugin.success("新对话已创建");
  } catch (error) {
    console.error("创建新会话失败:", error);
    MessagePlugin.error("创建新会话失败，请重试");
  }
};

// 删除会话
const deleteSession = async (index: number) => {
  if (chatSessions.value.length <= 1) {
    MessagePlugin.warning("至少需要保留一个会话");
    return;
  }

  const session = chatSessions.value[index];

  try {
    // 发送删除请求到后端
    await apiRequest(API_ENDPOINTS.DELETE_SESSION, {
      method: "DELETE",
      body: JSON.stringify({ sessionId: session.id }),
    });

    // 从本地状态中删除
    chatSessions.value.splice(index, 1);

    // 调整当前选中的会话索引
    if (currentSessionIndex.value >= index) {
      currentSessionIndex.value = Math.max(0, currentSessionIndex.value - 1);
    }

    // 如果删除的是当前会话，跳转到新的当前会话
    if (
      index === currentSessionIndex.value ||
      currentSessionIndex.value >= chatSessions.value.length
    ) {
      currentSessionIndex.value = Math.min(
        currentSessionIndex.value,
        chatSessions.value.length - 1
      );
      await router.push(`/chat/${chatSessions.value[currentSessionIndex.value].id}`);
    }

    MessagePlugin.success("会话已删除");
  } catch (error) {
    console.error("删除会话失败:", error);
    MessagePlugin.error("删除会话失败，请重试");
  }
};

// 选择会话
const selectSession = async (index: number) => {
  if (index < 0 || index >= chatSessions.value.length) return;

  currentSessionIndex.value = index;
  await router.push(`/chat/${chatSessions.value[index].id}`);
};

// 刷新会话列表
const refreshSessions = async () => {
  await fetchChatSessions();
  MessagePlugin.success("会话列表已刷新");
};

// 保存聊天会话
const saveChatSession = async (session: ChatSession): Promise<boolean> => {
  try {
    const saveData = {
      sessionId: session.id,
      session: {
        ...session,
        updated_at: Date.now() / 1000,
      },
    };

    await apiRequest(API_ENDPOINTS.SAVE_SESSION, {
      method: "POST",
      body: JSON.stringify(saveData),
    });

    console.log(`会话 ${session.id} 保存成功`);
    return true;
  } catch (error) {
    console.error("保存对话失败:", error);
    MessagePlugin.error("保存失败，请检查网络连接");
    return false;
  }
};

// 处理聊天更新事件
const handleChatUpdated = () => {
  if (currentSession.value) {
    saveChatSession(currentSession.value);
  }
};

// 发送消息
const inputEnter = async (inputValue: string) => {
  if (isStreamLoad.value || !inputValue.trim() || !currentSession.value) return;

  const currentId = currentSession.value.id;
  const sessionIndex = currentSessionIndex.value;

  // 添加用户消息
  const userMessage: ChatMessage = {
    avatar: "https://tdesign.gtimg.com/site/avatar.jpg",
    name: "您",
    datetime: new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    content: inputValue.trim(),
    role: "user",
    reasoning: "",
    duration: 0,
  };

  // 更新当前会话
  chatSessions.value[sessionIndex].history.push(userMessage);
  chatSessions.value[sessionIndex].lastMessage = inputValue.trim();

  // 更新会话标题（如果是新对话）
  if (
    !chatSessions.value[sessionIndex].title ||
    chatSessions.value[sessionIndex].title === "新对话"
  ) {
    chatSessions.value[sessionIndex].title =
      inputValue.length > 20 ? inputValue.substring(0, 20) + "..." : inputValue;
  }

  // 保存用户消息
  await saveChatSession(chatSessions.value[sessionIndex]);

  // 设置加载状态
  isStreamLoad.value = true;
  loading.value = true;

  try {
    // 读取当前选中的模型（支持 cloud:provider:model 格式）
    const selectedModel = localStorage.getItem('selected_model') || (() => {
      try {
        const cfg = JSON.parse(localStorage.getItem('user_model_config') || '{}')
        return cfg.llm_model || ''
      } catch { return '' }
    })()

    // 发送消息到后端API
    const response = await apiRequest(API_ENDPOINTS.SEND_MESSAGE, {
      method: "POST",
      body: JSON.stringify({
        message: inputValue.trim(),
        sessionId: currentId,
        history: chatSessions.value[sessionIndex].history,
        // 模型选择（云端/本地统一字段）
        model: selectedModel || undefined,
        // RAG 模式参数
        rag_mode: ragMode.value,
        kb_id: ragMode.value ? selectedKbId.value : undefined,
        // Ollama 本地设置（云端模型时后端忽略）
        ollamaSettings: {
          serverUrl: settings.serverUrl,
          timeout: settings.timeout
        }
      }),
    });

    // 模拟流式响应（可以根据实际API调整）
    await simulateStreamResponse(
      response.reply || `这是对"${inputValue}"的回复`,
      sessionIndex,
      response.sources || []
    );
  } catch (error) {
    console.error("发送消息失败:", error);

    // 添加错误消息
    const errorMessage: ChatMessage = {
      avatar: "https://tdesign.gtimg.com/site/chat-avatar.png",
      name: "系统",
      datetime: new Date().toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      content: "抱歉，消息发送失败，请检查网络连接后重试。",
      role: "assistant",
      reasoning: "",
      duration: 0,
    };

    chatSessions.value[sessionIndex].history.push(errorMessage);
    MessagePlugin.error("消息发送失败");
  } finally {
    isStreamLoad.value = false;
    loading.value = false;
  }
};

// 模拟流式响应
const simulateStreamResponse = async (content: string, sessionIndex: number, sources: SourceItem[] = []) => {
  const assistantMessage: ChatMessage = {
    avatar: "https://tdesign.gtimg.com/site/chat-avatar.png",
    name: "ASF助手",
    datetime: new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    content: "",
    role: "assistant",
    reasoning: "",
    duration: 0,
    sources: sources,
  };

  // 添加空的助手消息
  chatSessions.value[sessionIndex].history.push(assistantMessage);
  const messageIndex = chatSessions.value[sessionIndex].history.length - 1;

  // 模拟流式输出
  for (let i = 0; i <= content.length; i++) {
    if (!isStreamLoad.value) break; // 如果用户停止了，退出循环

    chatSessions.value[sessionIndex].history[messageIndex].content = content.substring(
      0,
      i
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  // 完成后保存
  await saveChatSession(chatSessions.value[sessionIndex]);
};

// 下载对话
const downloadChat = async () => {
  if (!currentSession.value || currentSession.value.history.length === 0) {
    MessagePlugin.warning("当前会话无内容可下载");
    return;
  }

  try {
    const downloadData = {
      chat_sessions: {
        [currentSession.value.id]: {
          ...currentSession.value,
          downloadTime: new Date().toISOString(),
          downloadVersion: "1.0",
        },
      },
    };

    const response = await apiRequest(API_ENDPOINTS.DOWNLOAD, {
      method: "POST",
      body: JSON.stringify(downloadData),
    });

    // 创建下载链接
    const blob = new Blob([JSON.stringify(downloadData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chat_${currentSession.value.id}_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    MessagePlugin.success("对话已下载");
  } catch (error) {
    console.error("下载对话失败:", error);
    MessagePlugin.error("下载失败，请重试");
  }
};

// 键盘事件处理
const handleKeyDown = (event: KeyboardEvent) => {
  if (event.ctrlKey && event.key === "c") {
    if (isStreamLoad.value) {
      event.preventDefault();
      handleStop();
    }
  }
};

// 停止流式响应
const handleStop = () => {
  if (isStreamLoad.value) {
    isStreamLoad.value = false;
    loading.value = false;
    showStopHint.value = true;

    setTimeout(() => {
      showStopHint.value = false;
    }, 2000);

    MessagePlugin.info("已停止生成");
  }
};

// 监听路由变化
watch(
  () => route.params.id,
  async (newId) => {
    if (newId && typeof newId === "string") {
      const sessionIndex = chatSessions.value.findIndex((s) => s.id === newId);
      if (sessionIndex !== -1) {
        currentSessionIndex.value = sessionIndex;
      }
    }
  }
);

// 生命周期钩子
import { onMounted as onMountedHook, onUnmounted } from "vue";

onMountedHook(async () => {
  // 注册键盘事件
  document.addEventListener("keydown", handleKeyDown);

  // 同步后端保存的模型配置（更新 selectedModel）
  await syncCurrentOllamaModel();

  // 加载知识库列表（RAG模式使用）
  await loadKbList();

  // 获取会话历史数据
  await fetchChatSessions();

  // 根据路由参数设置当前会话
  const routeId = route.params.id as string;
  if (routeId && chatSessions.value.length > 0) {
    const sessionIndex = chatSessions.value.findIndex((s) => s.id === routeId);
    if (sessionIndex !== -1) {
      currentSessionIndex.value = sessionIndex;
    } else {
      // 如果路由ID不存在，跳转到第一个会话
      currentSessionIndex.value = 0;
      await router.replace(`/chat/${chatSessions.value[0].id}`);
    }
  } else if (chatSessions.value.length > 0) {
    // 如果没有路由ID，跳转到第一个会话
    currentSessionIndex.value = 0;
    await router.replace(`/chat/${chatSessions.value[0].id}`);
  } else {
    // 如果没有会话，创建新会话
    await createNewSession();
  }
});

onUnmounted(() => {
  document.removeEventListener("keydown", handleKeyDown);
});
</script>

<style scoped>
/* ── 页面根容器：撑满 app-main 给出的 100vh ── */
.chat-page-root {
  display: flex;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: #fff;
}

/* ── 侧边栏 ── */
.chat-sidebar {
  width: 256px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  border-right: 1px solid #e5e7eb;
  background: #f9fafb;
  overflow: hidden;
}

.sidebar-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sidebar-sessions {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* ── 主聊天区域：撑满剩余空间 ── */
.chat-main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  min-width: 0;
  position: relative;
}

/* RAG 模式面板 */
.current-model-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
  margin-bottom: 8px;
  cursor: pointer;
  font-size: 12px;
  transition: background .2s;
}
.current-model-bar:hover { background: #dcfce7; }
.current-model-dot {
  width: 7px;
  height: 7px;
  background: #22c55e;
  border-radius: 50%;
  flex-shrink: 0;
}
.current-model-name {
  flex: 1;
  font-family: monospace;
  font-size: 11px;
  color: #166534;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.current-model-goto {
  font-size: 11px;
  color: #6b7280;
  white-space: nowrap;
}

.rag-panel {
  padding: 10px 12px;
  border-top: 1px solid #e5e7eb;
  background: #fafafa;
}

.rag-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.rag-toggle-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 500;
  color: #374151;
}

.rag-toggle-label svg {
  width: 14px;
  height: 14px;
  color: #4f7ef8;
}

.rag-kb-selector {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rag-kb-label {
  font-size: 11.5px;
  color: #6b7280;
}

.rag-kb-select {
  width: 100%;
}

.rag-kb-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #22c55e;
}

.rag-kb-hint svg {
  width: 12px;
  height: 12px;
}

/* 动画效果 */
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fade-in 0.3s ease-out;
}

/* 滚动条样式 */
:deep(*::-webkit-scrollbar) {
  width: 6px;
}

:deep(*::-webkit-scrollbar-track) {
  background: transparent;
}

:deep(*::-webkit-scrollbar-thumb) {
  background-color: rgba(156, 163, 175, 0.5);
  border-radius: 20px;
}

:deep(*::-webkit-scrollbar-thumb:hover) {
  background-color: rgba(156, 163, 175, 0.7);
}

/* TDesign 组件样式覆盖 */
:deep(.t-chat-input) {
  border-radius: 24px !important;
  padding: 12px 16px !important;
  background-color: #f5f5f5 !important;
  transition: all 0.3s ease;
}

:deep(.t-chat-input:focus) {
  box-shadow: 0 0 0 2px rgba(29, 78, 216, 0.2) !important;
  background-color: #ffffff !important;
}

:deep(.t-button--theme-primary) {
  background-color: #2563eb !important;
  border-color: #2563eb !important;
  transition: all 0.3s ease;
}

:deep(.t-button--theme-primary:hover) {
  background-color: #1d4ed8 !important;
  border-color: #1d4ed8 !important;
}

:deep(.t-loading__dots) {
  color: #2563eb !important;
}

/* 深色模式适配 */
@media (prefers-color-scheme: dark) {
  :deep(.t-chat-input) {
    background-color: #374151 !important;
    color: white !important;
  }

  :deep(.t-chat-input:focus) {
    background-color: #4b5563 !important;
  }
}
</style>