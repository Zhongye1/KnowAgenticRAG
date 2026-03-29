# KnowledgeRAG 文档站

KnowledgeRAG 知识管理系统的官方文档，使用 VitePress 构建

### 安装依赖

```bash
pnpm install
```

在docs目录下运行以下命令：

```bash
pnpm run dev # 运行开发服务器
```

访问 http://localhost:5173 查看文档站点

```bash
pnpm run build # 构建生产版本
```

构建产物将输出到 `docs/.vitepress/dist` 目录

### 预览构建结果

```bash
pnpm run preview
```

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

## 🔗 相关链接

- [KnowledgeRAG GitHub](https://github.com/Zhongye1/KnowledgeRAG-GZHU)
- [VitePress 官方文档](https://vitepress.dev/)
- [Vue 3 官方文档](https://vuejs.org/)
