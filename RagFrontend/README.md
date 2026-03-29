注：更新于2025-7-29

<p style="display:flex; justify-content: center">

[![My Skills](https://skillicons.dev/icons?i=html,css,js,ts,nodejs,vue,tailwindcss,electron,docker,git,npm,github,githubactions,figma)](https://skillicons.dev)

## This is @RAGF-01-frontend

---

![img](https://picx.zhimg.com/v2-be2f934768146c9b1a020041e91ee5ad_r.jpg)

![img](https://pic2.zhimg.com/v2-d881ef1100a79c39cb648af9b9d6f529_r.jpg)

---

### 目前实现的是前端功能，~~后端还在架构~~ 后端见backend仓库

### Contributors 📋

_Thanks goes to these wonderful people:_

<table border="1" cellpadding="10" cellspacing="0" width="100%" align="center">
    <tr>
        <td align="center" valign="top">
            <a href="https://github.com/Zhongye1">
                <img src="https://avatars.githubusercontent.com/u/145737758?v=4" alt="Vaibhav" width="100" height="100" border="0" />
                <br />
                <strong>Gotoh Hitori</strong>
                <br />
                <em>GitHub: <a href="https://github.com/Zhongye1">@Zhongye1</a></em>
                <br />
                Contributions: Code 💻 <br>Documentation 📖
            </a>
        </td>
        <td align="center" valign="top">
            <a href="https://github.com/ourcx">
                <img src="https://avatars.githubusercontent.com/u/173872687?v=4" alt="褚喧" width="100" height="100" border="0" />
                <br />
                <strong>褚喧</strong>
                <br />
                <em>GitHub: <a href="https://github.com/ourcx">@ourcx</a></em>
                <br />
                Contributions: 正在贡献
            </a>
        </td>
        <td align="center" valign="top">
            <a href="https://github.com/haha-1205">
                <img src="https://avatars.githubusercontent.com/u/222571036?s=400&u=254ac083b4d85e08dc7dee9d186624dfaa031614&v=4" alt="ZXT" width="100" height="100" border="0" />
                <br />
                <strong>ZXT</strong>
                <br />
                <em>GitHub: <a href="https://github.com/haha-1205">@haha-1205</a></em>
                <br />
                Contributions: 贡献
            </a>
        </td>
        <td align="center" valign="top">
            <a href="https://github.com/HJX">
                <img src="https://pica.zhimg.com/80/v2-3293674e35c7d8cf2040db9121bc559c_720w.webp" alt="HJX" width="100" height="100" border="0" />
                <br />
                <strong>HJX</strong>
                <br />
                <em>GitHub: <a href="https://github.com/HJX">@HJX</a></em>
                <br />
                Contributions: 友情客串
            </a>
        </td>
        <td align="center" valign="top">
            <a href="https://github.com/z1pperexplorer">
                <img src="https://avatars.githubusercontent.com/u/222624613?s=400&u=3778bd14e4e096302f3677074fe9c07545b18467&v=4" alt="A1r" width="100" height="100" border="0" />
                <br />
                <strong>A1r</strong>
                <br />
                <em>GitHub: <a href="https://github.com/z1pperexplorer">@z1pperexplorer</a></em>
                <br />
                Contributions: Contributing
            </a>
        </td>
    </tr>
</table>

# RAGF-01 项目开发文档

本文档描述了 RAGF-01 项目的架构、页面和功能实现。

## 项目概述

RAGF-01 是一个基于 Vue 3 和 TDesign 组件库开发的 RAG（检索增强生成）前端框架，主要提供知识库管理、文档检索和 AI 对话等功能。

- **前端框架**：Vue 3 + TypeScript
- **UI 组件库**：TDesign Vue Next
- **路由管理**：Vue Router
- **构建工具**：Vite
- **CSS 框架**：Tailwind CSS

### 进行开发（前端）

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

## 提交指南

1. Fork 项目仓库
2. 创建功能分支: `git checkout -b feature/amazing-feature`
3. 提交更改: `git commit -m 'Add amazing feature'`
4. 推送分支: `git push origin feature/amazing-feature`
5. 创建 Pull Request

### 就目前已有的模块中，有完善功能的想法和合并提交的代码前建议先在群里声明

---

## 项目结构

```
ASF-RAG/
├── metadata/              # 元数据目录
├── package.json          # 项目依赖和脚本配置
├── postcss.config.js     # PostCSS 配置
├── public/               # 静态资源目录
├── README.md             # 项目文档
├── src/                  # 源代码目录
├── uploads/              # 文件上传目录
│   └── chunks/          # 分片文件存储
├── tailwind.config.js    # Tailwind CSS 配置
├── tsconfig.json         # TypeScript 配置
├── tsconfig.node.json    # Node.js TypeScript 配置
└── vite.config.ts       # Vite 构建工具配置
```

## src目录结构

```
src/
├── App.vue              # 根组件
├── assets/              # 静态资源
│   ├── styles/          # 样式文件
│   └── svg/            # SVG 图标
├── components/          # 公共组件
│   ├── chat-main-unit/  # 聊天主组件
│   │   ├── chat-main-unit.vue
│   │   └── sseRequest-reasoning.ts
│   ├── ERS-Pages/      # 错误页面
│   │   └── 404.vue
│   ├── knowledge-unit/ # 知识库组件
│   │   └── knowledge-cards.vue
│   ├── search-unit/    # 搜索组件
│   │   └── search.vue
│   └── T-HeadBar.vue    # 顶部导航栏
├── router/             # 路由配置
│   └── index.ts
├── store/              # 状态管理
│   ├── index.ts
│   └── modules/
│       └── useCardData.ts
├── views/              # 页面组件
│   ├── Agent.vue       # 智能代理页面
│   ├── Chat.vue        # 聊天页面
│   ├── DOC.vue         # 文档页面
│   ├── FileManagement.vue # 文件管理页面
│   ├── KnowledgePages/ # 知识库相关页面
│   │   ├── file-upload.ts
│   │   ├── knowledgebase-create.ts
│   │   ├── KnowledgeBase.vue
│   │   └── KnowledgeDetail.vue
│   └── OllamaMangement.vue # Ollama模型管理页面
└── vite-env.d.ts       # Vite 环境类型声明

```

## 目前页面及功能 src/views

- ### 知识库（Knowledge Base）施工中 📋

  **目前实现了**

  1. **基础页面框架**

     - 知识库列表页面 (KnowledgeBase.vue) 的基本 UI 结构
     - 知识库详情页面 (KnowledgeDetail.vue) 的基本 UI 结构
     - 导航栏中的知识库入口

  2. **UI 组件**

     - 欢迎区域显示用户信息

     - 搜索框和创建知识库的选项

     - 知识卡片组件 (knowledge-cards.vue)

       ![img](https://pic2.zhimg.com/v2-b5e6163000d000cb7f01df92af8ed553_r.jpg)

  **未实现功能**

  1. ~~**知识库列表页 (KnowledgeBase.vue)**~~

     - ~~搜索功能用于过滤知识库~~

     - ~~创建新知识库的功能，这里应该设计一个新的表单页，显示创建新知识库的各个选项~~

       ![img](https://picx.zhimg.com/80/v2-33ffc0b45685f29acdee4b0462597c51_720w.png)

  2. **知识库详情页 (KnowledgeDetail.vue)**

     - ~~数据集管理~~
       - ~~文件列表显示（名称、分块数、上传日期等信息）~~
       - ~~文件操作（选择、启用/禁用、删除）~~
       - ~~文件搜索和批量操作~~
       - ~~文件上传功能（支持 PDF、DOCX 和 TXT 格式）~~
       - ~~分页功能~~
     - 检索测试
       - 跨语言搜索（支持多种语言）
       - ~~测试查询输入框~~
       - ~~文件选择器（用于选择要测试的特定文件）~~
       - 测试结果显示（包括相似度分数和匹配内容）
     - 知识库设置
       - 知识库名称，封面和描述等各种信息的编辑
       - 删除知识库的功能
       - 保存设置的功能

  ![img](https://picx.zhimg.com/80/v2-62e0c8025ff9d60e506fae3c59db615f_720w.png?source=d16d100b)

- ### 聊天（Chat）施工中 📋

  ![img](https://pica.zhimg.com/v2-b982906fb07aea6100b180c1c9689ba8_r.jpg)

### 目前的功能

1. 聊天功能
   - 聊天消息展示区域
   - 底部输入框组件
   - 模型选择下拉菜单
   - "深度思考"开关按钮
   - 回到底部按钮
2. **消息展示功能**
   - Markdown 渲染支持
   - 思考过程（推理过程）展示
   - 消息操作按钮（点赞、点踩、重新生成、复制）（这个具体逻辑还没做，只有 UI）
3. **基本交互功能**
   - 发送消息功能
   - 停止生成功能（通过按钮和 Ctrl+C 快捷键）
   - 清空聊天记录确认
   - 滚动到底部功能
   - 模型选择切换
4. **SSE 流式响应模拟**
   - 通过 `MockSSEResponse` 类实现的客户端模拟
   - 分阶段显示推理过程和内容
   - 模拟网络错误处理

目前要实现的功能：

![img](https://pic4.zhimg.com/v2-213b04b98eeac770e81800390145ce17_r.jpg)

1. **消息展示功能**
   - 消息操作按钮（点赞、点踩、重新生成、复制）（这个具体逻辑还没做，只有 UI）
   - 目前而言可以就已有后端进行实现
2. ~~**基本交互功能**~~
   - ~~模型选择切换~~
   - ~~模型选择下拉菜单触发模型选择~~
   - ~~"深度思考"开关触发模型深度思考~~
3. ~~**SSE 流式响应**~~

~~目前要考虑接模型后端 API 进行对话，目前模型的回复为硬编码的预设结果~~

侧边栏对话历史管理，实现正确的新建对话功能

### 导航栏 (T-HeadBar.vue)

导航栏提供应用内主要功能的快速访问入口：

![img](https://pic2.zhimg.com/80/v2-c49b6d95809145a2e2e39ed97667aca7_720w.webp)

- 右侧工具菜单（GitHub 链接、帮助、设置、首页和用户的触发处理逻辑）（目前功能还在实现）
- 这一块要新增一个文档页面

![img](https://pica.zhimg.com/80/v2-886faf9509f6db51b747f7accef5a8aa_720w.webp)

### 模型服务管理页面(OllamaMangement.vue)施工中 📋

提供全局搜索功能，允许用户搜索整个知识库集合。

### 文件管理页面 (FileManagement.vue) 施工中 📋

提供对上传文件的集中管理功能。

### 智能代理页面 (Agent.vue) 施工中 📋

提供智能代理功能，可能用于自动执行特定任务。

## # 后续开发

1. 实现用户认证和权限管理
2. 添加模型支持和参数配置
3. 实现文件处理能力，支持更多格式
4. 知识库管理：完整的知识库 CRUD 操作，支持文件上传、管理和检索测试。
5. 搜索功能：支持多语言环境下的文档检索，包括自动语言检测。
6. 分页和批量操作：针对大量文档提供高效的管理界面。
7. 实现文档协作功能
8. 打包并支持 docker 部署或者封装为 electron 应用什么的
9. 其余需求补充
