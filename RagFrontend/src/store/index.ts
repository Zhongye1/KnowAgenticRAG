// src/store/index.ts

import { createPinia } from 'pinia'
const pinia = createPinia()

export default pinia
export * from './modules/useCardData'
export * from './modules/useDataUser'
export * from './modules/useChatImg'
export * from './modules/useEvalStore'
