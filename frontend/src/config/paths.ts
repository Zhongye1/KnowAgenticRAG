export const paths = {
  home: {
    path: '/',
    getHref: () => '/',
  },

  auth: {
    login: {
      path: '/auth/login',
      getHref: (redirectTo?: string | null | undefined) =>
        `/auth/login${redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ''}`,
    },
  },

  app: {
    root: {
      path: '/app',
      getHref: () => '/app',
    },
    dashboard: {
      path: '',
      getHref: () => '/app',
    },
    chat: {
      path: 'chat',
      getHref: () => '/app/chat',
    },
    agents: {
      path: 'agents',
      getHref: () => '/app/agents',
    },
    space: {
      path: 'space',
      getHref: () => '/app/space',
    },
    knowledge: {
      path: 'knowledge',
      getHref: () => '/app/knowledge',
      kg: {
        path: 'kg',
        getHref: () => '/app/knowledge/kg',
        detail: {
          path: ':kbName',
          getHref: (kbName: string) =>
            `/app/knowledge/kg/${encodeURIComponent(kbName)}`,
        },
      },
      skills: {
        path: 'skills',
        getHref: () => '/app/knowledge/skills',
      },
      tools: {
        path: 'tools',
        getHref: () => '/app/knowledge/tools',
      },
      mcp: {
        path: 'mcp',
        getHref: () => '/app/knowledge/mcp',
      },
    },
    overview: {
      path: 'overview',
      getHref: () => '/app/overview',
    },
    discussions: {
      path: 'discussions',
      getHref: () => '/app/discussions',
    },
    discussion: {
      path: 'discussions/:discussionId',
      getHref: (id: string) => `/app/discussions/${id}`,
    },
    users: {
      path: 'users',
      getHref: () => '/app/users',
    },
    profile: {
      path: 'profile',
      getHref: () => '/app/profile',
    },
  },
} as const;
