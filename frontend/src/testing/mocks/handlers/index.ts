import { HttpResponse, http } from 'msw';

import { env } from '@/config/env';

import { networkDelay } from '../utils';

import { authHandlers } from './auth';
import { usersHandlers } from './users';
import { knowledgeExportHandlers, knowledgeHandlers } from './knowledge';
import { chatHandlers } from './chat';

export const handlers = [
  ...authHandlers,
  ...usersHandlers,
  ...knowledgeHandlers,
  ...knowledgeExportHandlers,
  ...chatHandlers,
  http.get(`${env.API_URL}/healthcheck`, async () => {
    await networkDelay();
    return HttpResponse.json({ ok: true });
  }),
];
