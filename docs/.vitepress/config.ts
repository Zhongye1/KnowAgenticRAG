import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
    title: "KnowledgeRAG",
    description: "系统文档",

    // 部署到 GitHub Pages 的子路径
    base: "/KnowledgeRAG-GZHU/",
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
            { text: "开始", link: "/开始/" },
            { text: "工程治理", link: "/工程治理/" },
            { text: "API", link: "/api/api" },
        ],

        sidebar: [
            {
                text: "开始",
                items: [
                    { text: "本地启动", link: "/开始/" },
                ],
            },
            {
                text: "工程治理[必读]",
                items: [
                    { text: "关于工程治理", link: "/工程治理/" },
                    {
                        text: "环境与配置",
                        items: [
                            { text: "环境变量", link: "/工程治理/环境变量" },
                            { text: "配置清单", link: "/工程治理/配置清单" },
                        ],
                    },
                    {
                        text: "架构设计",
                        items: [
                            { text: "数据库层设计", link: "/工程治理/数据库层设计" },
                            { text: "认证授权设计", link: "/工程治理/认证授权设计" },
                            { text: "消息队列设计", link: "/工程治理/消息队列设计" },
                            { text: "路由层设计", link: "/工程治理/路由层设计" },
                            { text: "中间件与异常处理", link: "/工程治理/中间件与异常处理" },
                        ],
                    },
                    {
                        text: "开发规范",
                        items: [
                            { text: "业务模块开发规范", link: "/工程治理/业务模块开发规范" },
                        ],
                    },
                    {
                        text: "交付",
                        items: [
                            { text: "构建与部署", link: "/工程治理/构建与部署" },
                        ],
                    },
                ],
            },
            {
                text: "参考（框架知识）",
                items: [
                    { text: "CORS", link: "/参考/CORS" },
                    { text: "CRUD", link: "/参考/CRUD" },
                    { text: "Celery", link: "/参考/Celery" },
                    { text: "JWT", link: "/参考/JWT" },
                    { text: "OAuth 2.0", link: "/参考/OAuth 2.0" },
                    { text: "RBAC", link: "/参考/RBAC" },
                    { text: "SSO", link: "/参考/SSO" },
                    { text: "Schema", link: "/参考/Schema" },
                    { text: "Socket.io", link: "/参考/Socket.io" },
                    { text: "主键", link: "/参考/主键" },
                    { text: "事务", link: "/参考/事务" },
                    { text: "分页", link: "/参考/分页" },
                    { text: "国际化", link: "/参考/国际化" },
                    { text: "多租户", link: "/参考/多租户" },
                    { text: "接口响应", link: "/参考/接口响应" },
                    { text: "数据权限", link: "/参考/数据权限" },
                    { text: "时区", link: "/参考/时区" },
                    { text: "模型(db)", link: "/参考/模型(db)" },
                    { text: "缓存", link: "/参考/缓存" },
                    { text: "节流", link: "/参考/节流" },
                    { text: "路由", link: "/参考/路由" },
                    { text: "配置", link: "/参考/配置" },
                ],
            },
            {
                text: "API",
                items: [{ text: "API 文档", link: "/api/api" }],
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
    ignoreDeadLinks: true,
});
