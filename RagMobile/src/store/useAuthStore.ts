import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { api } from '../utils/api';

interface User {
  id: number;
  email: string;
  created_at?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loadToken: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  loading: false,

  loadToken: async () => {
    try {
      const token = await SecureStore.getItemAsync('auth_token');
      if (!token) return false;
      set({ token });
      // 验证 token 并获取用户信息
      const res = await api.get('/api/user/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      set({ user: res.data });
      return true;
    } catch {
      await SecureStore.deleteItemAsync('auth_token');
      set({ token: null, user: null });
      return false;
    }
  },

  login: async (email, password) => {
    set({ loading: true });
    try {
      const res = await api.post('/api/user/login', { email, password });
      const token: string = res.data.access_token ?? res.data.token;
      await SecureStore.setItemAsync('auth_token', token);
      set({ token, loading: false });
      // 拉取用户信息
      const userRes = await api.get('/api/user/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      set({ user: userRes.data });
    } catch (e) {
      set({ loading: false });
      throw e;
    }
  },

  register: async (email, password) => {
    set({ loading: true });
    try {
      await api.post('/api/user/register', { email, password });
      set({ loading: false });
    } catch (e) {
      set({ loading: false });
      throw e;
    }
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('auth_token');
    set({ user: null, token: null });
  },
}));
