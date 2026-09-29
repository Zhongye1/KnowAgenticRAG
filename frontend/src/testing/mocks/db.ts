import { factory, primaryKey } from '@mswjs/data';
import { nanoid } from 'nanoid';

const models = {
  // 字段对齐后端 `GET /sys/users/me`（GetCurrentUserInfoWithRelationDetail）：
  // 会话用户是所有登录后页面的底座，mock 少了字段页面在测试里就渲染成空壳。
  user: {
    id: primaryKey(nanoid),
    username: String,
    nickname: String,
    avatar: String,
    email: String,
    phone: String,
    password: String,
    dept: String,
    roles: () => [] as string[],
    is_superuser: Boolean,
    createdAt: Date.now,
  },
};

export const db = factory(models);

export type Model = keyof typeof models;

const dbFilePath = 'mocked-db.json';

export const loadDb = async () => {
  // If we are running in a Node.js environment
  if (typeof window === 'undefined') {
    const { readFile, writeFile } = await import('fs/promises');
    try {
      const data = await readFile(dbFilePath, 'utf8');
      return JSON.parse(data);
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        const emptyDB = {};
        await writeFile(dbFilePath, JSON.stringify(emptyDB, null, 2));
        return emptyDB;
      } else {
        console.error('Error loading mocked DB:', error);
        return null;
      }
    }
  }
  // If we are running in a browser environment
  return Object.assign(
    JSON.parse(window.localStorage.getItem('msw-db') || '{}'),
  );
};

export const storeDb = async (data: string) => {
  // If we are running in a Node.js environment
  if (typeof window === 'undefined') {
    const { writeFile } = await import('fs/promises');
    await writeFile(dbFilePath, data);
  } else {
    // If we are running in a browser environment
    window.localStorage.setItem('msw-db', data);
  }
};

export const persistDb = async (model: Model) => {
  if (process.env.NODE_ENV === 'test') return;
  const data = await loadDb();
  data[model] = db[model].getAll();
  await storeDb(JSON.stringify(data));
};

export const initializeDb = async () => {
  const database = await loadDb();
  Object.entries(db).forEach(([key, model]) => {
    const dataEntres = database[key];
    if (dataEntres) {
      dataEntres?.forEach((entry: Record<string, any>) => {
        model.create(entry);
      });
    }
  });
};

export const resetDb = () => {
  window.localStorage.clear();
};
