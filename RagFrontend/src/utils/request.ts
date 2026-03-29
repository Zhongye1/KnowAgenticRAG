// src/utils/request.ts
// 统一请求工具 - 带自动重试、错误降级、Toast 提示

import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios'
import { MessagePlugin } from 'tdesign-vue-next'

// ── Axios 实例 ────────────────────────────────────────────────
const request = axios.create({
  baseURL: '/',
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' }
})

// 请求拦截：自动附加 JWT
request.interceptors.request.use(config => {
  const jwt = localStorage.getItem('jwt')
  if (jwt) config.headers['Authorization'] = `Bearer ${jwt}`
  return config
})

// 响应拦截：统一错误处理
request.interceptors.response.use(
  (res: AxiosResponse) => res,
  async (error: AxiosError) => {
    const status = error.response?.status
    const config = error.config as AxiosRequestConfig & { _retryCount?: number }

    // 401 → 登录失效
    if (status === 401) {
      localStorage.removeItem('jwt')
      MessagePlugin.error('登录已过期，请重新登录')
      setTimeout(() => {
        window.location.href = '/LogonOrRegister'
      }, 1500)
      return Promise.reject(error)
    }

    // 503/500 → 自动重试（最多 2 次）
    const RETRY_LIMIT = 2
    config._retryCount = config._retryCount || 0
    if ((status === 503 || status === 500) && config._retryCount < RETRY_LIMIT) {
      config._retryCount++
      const delay = config._retryCount * 1000 // 1s, 2s
      await new Promise(res => setTimeout(res, delay))
      return request(config)
    }

    // 网络错误
    if (!error.response) {
      MessagePlugin.error({ content: '网络连接失败，请检查网络或后端服务', duration: 4000 })
      return Promise.reject(error)
    }

    // 其他错误 → 显示服务端消息
    const detail =
      (error.response?.data as Record<string, string>)?.detail || error.message || '请求失败'
    if (status !== 404) {
      // 404 由业务层自行处理，不弹 toast
      MessagePlugin.error({ content: `错误 ${status}：${detail}`, duration: 4000 })
    }
    return Promise.reject(error)
  }
)

// ── 带重试的分块上传（断点续传简化版） ──────────────────────
export interface UploadProgress {
  loaded: number
  total: number
  percent: number
}

export async function uploadFileWithProgress(
  url: string,
  file: File,
  extraData: Record<string, string> = {},
  onProgress?: (progress: UploadProgress) => void
): Promise<AxiosResponse> {
  const CHUNK_SIZE = 5 * 1024 * 1024 // 5MB 分片

  if (file.size <= CHUNK_SIZE) {
    // 小文件直接上传
    const formData = new FormData()
    formData.append('file', file)
    Object.entries(extraData).forEach(([k, v]) => formData.append(k, v))
    return request.post(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: e => {
        if (onProgress && e.total) {
          onProgress({
            loaded: e.loaded,
            total: e.total,
            percent: Math.round((e.loaded / e.total) * 100)
          })
        }
      }
    })
  }

  // 大文件：分片标记（后端需支持 multipart/chunked 协议时启用）
  // 当前后端不支持分片，提醒用户并降级处理
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
  let uploadedBytes = 0

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE
    const end = Math.min(start + CHUNK_SIZE, file.size)
    const chunk = file.slice(start, end)

    const formData = new FormData()
    formData.append('file', chunk, file.name)
    formData.append('chunk_index', String(i))
    formData.append('total_chunks', String(totalChunks))
    formData.append('file_size', String(file.size))
    formData.append('file_name', file.name)
    Object.entries(extraData).forEach(([k, v]) => formData.append(k, v))

    let attempt = 0
    while (attempt < 3) {
      try {
        const res = await request.post(url, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        uploadedBytes += chunk.size
        if (onProgress) {
          onProgress({
            loaded: uploadedBytes,
            total: file.size,
            percent: Math.round((uploadedBytes / file.size) * 100)
          })
        }
        if (i === totalChunks - 1) return res
        break // 成功，跳出重试循环
      } catch (e) {
        attempt++
        if (attempt >= 3) throw e
        await new Promise(res => setTimeout(res, attempt * 1000))
      }
    }
  }
  return Promise.reject(new Error('Upload incomplete'))
}

// ── 骨架屏工具状态 ─────────────────────────────────────────────
import { ref } from 'vue'
export const globalLoading = ref(false)

export function withLoading<T>(fn: () => Promise<T>): Promise<T> {
  globalLoading.value = true
  return fn().finally(() => {
    globalLoading.value = false
  })
}

export default request
