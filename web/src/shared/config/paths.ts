/**
 * 路由常量。信息架构对齐上游 Vue 实现的顶层路由：
 * 首页 / 登录 / OIDC 回调 / CLI 授权 / 智能体 / 个人空间 / 数据总览 / 智能体管理 / 扩展。
 */
export const paths = {
  home: {
    path: '/',
    getHref: () => '/',
  },

  auth: {
    login: {
      path: '/login',
      getHref: (redirectTo?: string | null | undefined) =>
        `/login${redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ''}`,
    },
    oidcCallback: {
      path: '/auth/oidc/callback',
      getHref: () => '/auth/oidc/callback',
    },
    cliAuthorize: {
      path: '/auth/cli/authorize',
      getHref: () => '/auth/cli/authorize',
    },
  },

  app: {
    chat: {
      path: '/agent',
      getHref: (threadId?: string) =>
        threadId ? `/agent/${encodeURIComponent(threadId)}` : '/agent',
    },
    workspace: {
      path: '/workspace',
      getHref: () => '/workspace',
    },
    /** 数据总览，仅超管可见（前端约束，后端权限才是边界）。 */
    dashboard: {
      path: '/dashboard',
      getHref: () => '/dashboard',
    },
    agentManage: {
      path: '/agent-manage',
      getHref: () => '/agent-manage',
    },
    extensions: {
      path: '/extensions',
      getHref: () => '/extensions',
      knowledgeBase: {
        path: '/extensions/knowledgebase/:kbId',
        getHref: (kbId: string) =>
          `/extensions/knowledgebase/${encodeURIComponent(kbId)}`,
      },
      mcp: {
        path: '/extensions/mcp/:slug',
        getHref: (slug: string) => `/extensions/mcp/${encodeURIComponent(slug)}`,
      },
      skill: {
        path: '/extensions/skill/:slug',
        getHref: (slug: string) =>
          `/extensions/skill/${encodeURIComponent(slug)}`,
      },
    },
  },
} as const;
