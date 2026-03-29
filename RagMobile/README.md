# KnowledgeRAG Mobile

基于 **React Native + Expo** 的移动端 App，功能完整对齐 Web 端（KnowledgeRAG-GZHU）。

## 功能清单

| 功能          | 说明                                                                     |
| ------------- | ------------------------------------------------------------------------ |
| 🔐 登录/注册  | 邮箱密码登录，JWT 本地安全存储                                           |
| 📚 知识库管理 | 创建/删除知识库，彩色卡片，星标置顶                                      |
| 📄 文档管理   | 上传文件（PDF/Word/TXT），批量 URL 导入，向量化状态展示                  |
| 💬 RAG 对话   | SSE 流式输出，RAG 模式一键开关，引用溯源气泡                             |
| 🎙️ 语音输入   | MediaRecorder 录音，Whisper 本地转录，聊天输入直填                       |
| 🤖 Agent 任务 | 多步推理可视化（思考/调用工具/观察/答案），联网搜索开关，历史持久        |
| ⚙️ 设置       | 多模型切换（Ollama/DeepSeek/OpenAI/混元），Obsidian 同步，飞书机器人配置 |

---

## 快速开始

### 1. 安装依赖

```bash
cd RagMobile
npm install --legacy-peer-deps
```

### 2. 配置后端地址

**方式 A：修改 `src/utils/api.ts`**（开发时直接改）

```ts
const BASE_URL = "http://你的IP:8000"; // 手机和电脑需在同一局域网
```

**方式 B：环境变量**

```bash
# .env.local
EXPO_PUBLIC_API_URL=http://192.168.1.100:8000
```

> ⚠️ 真机调试时不能用 `localhost`，要用电脑在局域网的 IP 地址

### 3. 启动开发服务器

```bash
npx expo start
```

然后：

- **iOS 模拟器**：按 `i`
- **Android 模拟器**：按 `a`
- **真机**：扫码（需安装 **Expo Go** App）

---

## 目录结构

```
RagMobile/
├── App.tsx                   # 入口
├── app.json                  # Expo 配置（权限声明）
├── src/
│   ├── constants/
│   │   └── theme.ts          # 颜色/字体/间距常量
│   ├── navigation/
│   │   └── Navigation.tsx    # Stack + BottomTab 导航
│   ├── screens/
│   │   ├── LoginScreen.tsx   # 登录/注册
│   │   ├── KnowledgeBaseScreen.tsx   # 知识库列表
│   │   ├── KnowledgeDetailScreen.tsx # 知识库详情+文档管理
│   │   ├── ChatScreen.tsx    # RAG 对话
│   │   ├── AgentScreen.tsx   # Agent 任务模式
│   │   └── SettingsScreen.tsx # 设置（模型/联动/账号）
│   ├── components/
│   │   ├── MessageBubble.tsx # 消息气泡（含引用溯源）
│   │   └── VoiceButton.tsx   # 语音录制按钮
│   ├── store/
│   │   ├── useAuthStore.ts   # 认证状态（zustand）
│   │   ├── useKbStore.ts     # 知识库状态
│   │   └── useChatStore.ts   # 对话状态（SSE流式）
│   └── utils/
│       └── api.ts            # axios + SSE 工具
└── package.json
```

---

## 打包发布

### Android APK（本地测试）

```bash
# 需安装 EAS CLI
npm install -g eas-cli
eas build -p android --profile preview
```

### iOS（需 Apple 开发者账号）

```bash
eas build -p ios --profile preview
```

### 本地构建（不用 EAS 云服务）

```bash
# Android
npx expo run:android

# iOS（仅 macOS）
npx expo run:ios
```

---

## 语音功能说明

语音输入依赖后端 Whisper 服务：

```bash
# 后端安装 Whisper
pip install openai-whisper

# 启动后端（确保 /api/voice/transcribe 可用）
cd RagBackend && python main.py
```

支持格式：m4a / wav / mp3 / ogg / webm

---

## 飞书机器人配置

在 App 设置页「联动 → 飞书机器人」填写 App ID + Secret，
Webhook 地址格式：`http://你的服务器IP:8000/api/integrations/feishu/webhook`

详细步骤见 Web 端设置页内的引导说明。
