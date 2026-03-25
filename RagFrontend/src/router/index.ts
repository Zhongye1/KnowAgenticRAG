import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import KnowledgeBase from '../views/KnowledgePages/KnowledgeBase.vue'
import NotFound from '../components/ERS-Pages/404.vue'
//import { get, post } from '@/utils/ASFaxios'
interface UserResponse {
  status: string;
}

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    redirect: '/knowledge'
  },
  {
    path: '/knowledge',
    name: 'KnowledgeBase',
    component: KnowledgeBase
  },
  {
    path: '/knowledge/knowledgeDetail/:id',
    name: 'KnowledgeDetail',
    component: () => import('../views/KnowledgePages/KnowledgeDetail.vue')
  },
  {
    path: '/chat',
    name: 'Chat',
    component: () => import('../views/Chat.vue')
  },
  {
    path: '/chat/:id',
    name: 'chatID',
    component: () => import('../views/Chat.vue')
  },
  {
    path: '/service',
    name: 'Search',
    component: () => import('../views/Ollama_Pages/ollama_basic_pages.vue')
  },
  {
    path: '/history',
    name: 'History',
    component: () => import('../views/History.vue')
  },
  {
    path: '/agent',
    name: 'Agent',
    component: () => import('../views/Agent.vue')
  },
  {
    path: '/files',
    name: 'FileManagement',
    component: () => import('../views/FileManagement.vue')
  },
  {
    path: '/DOC',
    name: '开发文档',
    component: () => import('../views/DOC.vue')
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../views/Settings.vue')
  },
  {
    path: '/LogonOrRegister',
    name: '登录',
    component: () => import('../views/LogonOrRegister/LogonOrRegister.vue')
  },
  {
    path: '/user',
    name: '用户界面',
    component: () => import('../views/TabHeader/User_Page.vue'),
    children: [
      {
        path: '/user/userInfo',
        name: '用户信息',
        component: () => import('../components/user-primary/user-primary.vue')
      },
      {
        path: '/user/coming-soon/:id',
        name: '功能即将上线',
        component: () => import('../components/user-primary/ComingSoon.vue')
      }
    ]
  },
  {
    path: '/acmd_sre',
    name: 'ACMD',
    component: () => import('../views/ACMD_serach/ACMD_search.vue'),
  },
  {
    path: '/testrange',
    name: 'CTE',
    component: () => import('../components/graph-unit/graph-main.vue'),
  },
  {
    path: '/devtools',
    name: 'DevTools',
    component: () => import('../views/DevTools.vue'),
    meta: { devOnly: true }
  },
  // 添加专门的404页面路由
  {
    path: '/404',
    name: 'NotFound',
    component: NotFound,
    meta: {
      title: '页面未找到'
    }
  },

  // 捕获所有未匹配的路由并重定向到404
  {
    path: '/:pathMatch(.*)*',
    redirect: '/404'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

const publicRoutes = ['/LogonOrRegister', '/devtools'];

router.beforeEach((to, from, next) => {
  // 如果是公开路由，直接放行
  if (publicRoutes.includes(to.path)) {
    return next();
  }

  const jwt = localStorage.getItem('jwt');
  // 没有JWT时重定向到登录页
  if (!jwt) {
    return next(`/LogonOrRegister?redirect=${encodeURIComponent(to.fullPath)}`);
  }

  // 验证JWT有效性
  fetch('/api/users/me', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${jwt}`
    }
  })
    .then(response => response.json())
    .then((res: UserResponse) => {
      if (res.status === "success") {
        next();
      } else {
        // token无效时清理并重定向
        localStorage.removeItem('jwt');
        next(`/LogonOrRegister?redirect=${encodeURIComponent(to.fullPath)}`);
      }
    })
    .catch(() => {
      localStorage.removeItem('jwt');
      next(`/LogonOrRegister?redirect=${encodeURIComponent(to.fullPath)}`);
    });
});

export default router

