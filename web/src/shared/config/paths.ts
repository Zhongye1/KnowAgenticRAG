/**
 * 路由常量。对外路径集中在这里，页面与组件只引用它，不手拼字符串。
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
    /** 自助注册；`redirectTo` 与登录同义，注册成功直接落到目标页。 */
    register: {
      path: '/register',
      getHref: (redirectTo?: string | null | undefined) =>
        `/register${redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ''}`,
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
      /** 不传 tab 时落到扩展页的默认 tab；技能详情返回时必须带 `skills`。 */
      getHref: (tab?: string) =>
        tab ? `/extensions?tab=${tab}` : '/extensions',
      knowledgeBase: {
        path: '/extensions/knowledgebase/:kbId',
        getHref: (kbId: string) =>
          `/extensions/knowledgebase/${encodeURIComponent(kbId)}`,
      },
      mcp: {
        path: '/extensions/mcp/:slug',
        getHref: (slug: string) =>
          `/extensions/mcp/${encodeURIComponent(slug)}`,
      },
      skill: {
        path: '/extensions/skill/:slug',
        getHref: (slug: string) =>
          `/extensions/skill/${encodeURIComponent(slug)}`,
      },
    },
  },
} as const;
