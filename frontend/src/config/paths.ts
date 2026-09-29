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
    /**
     * 管理面板（仅超管可进，见 `lib/auth.tsx:useIsSuperuser`）。
     *
     * 保留 `/app/users` 路径常量并指向新面板：旧页是 fba 模板遗留（读假接口），
     * 直接改指可避免既有链接/书签 404。
     */
    users: {
      path: 'users',
      getHref: () => '/app/admin/users',
    },
    admin: {
      path: 'admin',
      getHref: () => '/app/admin',
      users: {
        path: 'users',
        getHref: () => '/app/admin/users',
      },
      depts: {
        path: 'depts',
        getHref: () => '/app/admin/depts',
      },
      roles: {
        path: 'roles',
        getHref: () => '/app/admin/roles',
      },
      kbAcl: {
        path: 'kb-acl',
        getHref: () => '/app/admin/kb-acl',
      },
    },
    /**
     * 旧「个人信息」页已并入个人空间（见 `app/routes/app/profile.tsx` 的重定向）。
     * 路径常量保留并指向新地址，避免既有引用 404。
     */
    profile: {
      path: 'profile',
      getHref: () => '/app/space',
    },
  },
} as const;
