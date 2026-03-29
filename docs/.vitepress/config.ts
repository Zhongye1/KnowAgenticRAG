import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
    title: "KnowledgeRAG",
    description: "系统文档",

    head: [
        [
            "link",
            {
                rel: "icon",
                href: "https://avatars.githubusercontent.com/u/145737758?s=48&v=4",
            },
        ],
    ],

    themeConfig: {
        // https://vitepress.dev/reference/default-theme-config

        nav: [
            { text: "首页", link: "/" },
            { text: "指南", link: "/guide/" },
            { text: "工程治理", link: "/工程治理/" },
            { text: "API", link: "/API_reference/api/" },
        ],

        sidebar: [
            {
                text: "入门",
                items: [
                    { text: "快速上手", link: "/guide/" },
                    { text: "项目功能", link: "/guide/项目功能说明" },
                    { text: "系统架构", link: "/guide/系统架构说明" },
                ],
            },
            {
                text: "工程治理[必读]",
                items: [
                    { text: "关于工程治理", link: "/工程治理/" },
                    {
                        text: "Fastapi后端",
                        link: "/工程治理/后端",
                    },
                    {
                        text: "vue+ts前端",
                        link: "/工程治理/前端",
                    },
                    {
                        text: "移动客户端",
                        link: "/工程治理/移动客户端",
                    },
                    {
                        text: "前后端联调",
                        link: "/工程治理/前后端联调",
                    },
                    {
                        text: "构建与部署",
                        link: "/工程治理/构建与部署",
                    },
                ],
            },
            {
                text: "核心功能",
                items: [
                    { text: "知识库管理", link: "/features/knowledge-base" },
                    { text: "文档处理", link: "/features/document-processing" },
                    { text: "RAG 系统", link: "/features/rag-system" },
                    { text: "Agent 架构", link: "/features/agent" },
                    { text: "用户管理", link: "/features/user-management" },
                ],
            },
            {
                text: "API",
                items: [{ text: "API 文档", link: "/API_reference/api/" }],
            },
        ],

        socialLinks: [
            {
                icon: "github",
                link: "https://github.com/Zhongye1/KnowledgeRAG-GZHU",
            },
        ],

        footer: {
            message: "本文档站基于 VitePress 构建",
            copyright: "萌ICP备 1762389 © 2026 KnowledgeRAG-GZHU",
        },

        search: {
            provider: "local",
        },
    },

    markdown: {
        lineNumbers: true,
    },
});
