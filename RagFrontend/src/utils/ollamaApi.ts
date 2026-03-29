// NEW_FILE_CODE
import { MessagePlugin } from 'tdesign-vue-next'
import API_ENDPOINTS from '@/utils/apiConfig'

class OllamaApiService {
  private serverUrl: string = ''

  constructor() {
    // 从localStorage获取服务器配置，如果没有则使用默认值
    this.loadSettings()

    // 监听设置更新事件（使用 EventListener 兼容类型）
    window.addEventListener('ollamaSettingsUpdated', this.handleSettingsUpdated as EventListener)
  }

  // 加载设置
  private loadSettings() {
    const savedSettings = localStorage.getItem('ollamaSettings')
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings)
        this.serverUrl = settings.serverUrl || API_ENDPOINTS.OLLAMA.BASE
      } catch (e) {
        console.error('解析Ollama设置失败:', e)
        this.serverUrl = API_ENDPOINTS.OLLAMA.BASE
      }
    } else {
      this.serverUrl = API_ENDPOINTS.OLLAMA.BASE
    }
  }

  // 处理设置更新事件
  private handleSettingsUpdated = (event: Event) => {
    const customEvent = event as CustomEvent
    this.serverUrl = customEvent.detail?.serverUrl || this.serverUrl
  }

  // 更新服务器URL（用于手动设置）
  updateServerUrl(url: string) {
    this.serverUrl = url
  }

  // 获取当前服务器URL
  getServerUrl(): string {
    return this.serverUrl
  }

  // 获取模型列表
  async getModels() {
    try {
      const response = await fetch(`${this.serverUrl}${API_ENDPOINTS.OLLAMA.TAGS}`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      return data.models || []
    } catch (error) {
      console.error('获取模型列表失败:', error)
      throw new Error(`获取模型列表失败: ${(error as Error).message}`)
    }
  }

  // 删除模型
  async deleteModel(name: string) {
    try {
      const response = await fetch(`${this.serverUrl}${API_ENDPOINTS.OLLAMA.DELETE}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return response.ok
    } catch (error) {
      console.error('删除模型失败:', error)
      return false
    }
  }

  // 下载模型
  async downloadModel(name: string, onProgress?: (data: any) => void) {
    try {
      const response = await fetch(`${this.serverUrl}${API_ENDPOINTS.OLLAMA.PULL}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      if (!response.body) {
        throw new Error('响应体为空')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(line => line.trim())

        for (const line of lines) {
          try {
            const data = JSON.parse(line)
            if (onProgress) onProgress(data)
          } catch (e) {
            console.warn('解析进度数据失败:', e)
          }
        }
      }
    } catch (error) {
      console.error('下载模型失败:', error)
      throw new Error(`下载模型失败: ${(error as Error).message}`)
    }
  }

  // 复制模型（用于重命名）
  async copyModel(source: string, destination: string) {
    try {
      const response = await fetch(`${this.serverUrl}${API_ENDPOINTS.OLLAMA.COPY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, destination })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return response.ok
    } catch (error) {
      console.error('复制模型失败:', error)
      return false
    }
  }
}

// 创建并导出单例
const ollamaApiService = new OllamaApiService()
export default ollamaApiService
