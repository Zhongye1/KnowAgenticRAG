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
