# KnowledgeRAG 文档站点

这是 KnowledgeRAG 知识管理系统的官方文档，使用 VitePress 构建。

## 📚 文档结构

```
docs/
├── .vitepress/              # VitePress 配置目录
│   └── config.ts           # 站点配置文件
├── guide/                   # 入门指南
│   ├── index.md           # 快速上手
│   ├── features.md        # 项目功能
│   └── architecture.md    # 系统架构
├── features/                # 核心功能
│   ├── knowledge-base.md  # 知识库管理
│   ├── document-processing.md  # 文档处理
│   ├── rag-system.md      # RAG 系统
│   ├── agent.md           # Agent 架构
│   └── user-management.md # 用户管理
├── reference/             # 参考文档
│   ├── api.md            # API 接口文档
│   └── deployment.md     # 部署指南
├── index.md              # 首页
└── package.json          # 项目依赖
```

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 运行开发服务器

```bash
npm run docs:dev
```

访问 http://localhost:5173 查看文档站点。

### 构建生产版本

```bash
npm run docs:build
```

构建产物将输出到 `docs/.vitepress/dist` 目录。

### 预览构建结果

```bash
npm run docs:preview
```

## 📖 主要内容

### 入门指南

- [快速上手](/guide/) - 了解 KnowledgeRAG 的基本概念和快速开始
- [项目功能](/guide/features) - 详细的功能介绍
- [系统架构](/guide/architecture) - 技术架构和组件说明

### 核心功能

- [知识库管理](/features/knowledge-base) - 创建和管理知识库
- [文档处理](/features/document-processing) - 文档上传、解析和向量化
- [RAG 系统](/features/rag-system) - 检索增强生成技术详解
- [Agent 架构](/features/agent) - ReAct Agent 智能体说明
- [用户管理](/features/user-management) - 用户认证和权限管理

### 参考文档

- [API 接口](/reference/api) - 完整的 RESTful API 文档
- [部署指南](/reference/deployment) - 生产环境部署步骤

## 🔧 自定义配置

编辑 `.vitepress/config.ts` 文件可以修改：

- 站点标题和描述
- 导航栏菜单
- 侧边栏目录
- 主题配置
- SEO 设置

## 📝 添加新文档

1. 在对应目录下创建 `.md` 文件
2. 使用 Front Matter 设置页面标题
3. 在 `config.ts` 的 sidebar 中添加导航项
4. 使用 Markdown 语法编写内容

示例：

```markdown
---
title: 页面标题
outline: deep
---

# 标题

这里是内容...
```

## 🎨 主题特性

- ✅ 响应式设计
- ✅ 暗色模式支持
- ✅ 全文搜索
- ✅ 语法高亮
- ✅ 目录导航
- ✅ 上一页/下一页链接

## 📦 技术栈

- **VitePress** 2.0.0-alpha.17 - 静态站点生成器
- **Vue 3** - 渐进式 JavaScript 框架
- **Vite** - 下一代前端构建工具

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进文档！

## 📄 许可证

MIT License

## 🔗 相关链接

- [KnowledgeRAG GitHub](https://github.com/gzhu/knowledgerag)
- [VitePress 官方文档](https://vitepress.dev/)
- [Vue 3 官方文档](https://vuejs.org/)
