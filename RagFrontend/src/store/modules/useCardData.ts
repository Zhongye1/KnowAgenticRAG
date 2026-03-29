// store/modules/user.ts
import { defineStore } from 'pinia'
import axios from 'axios'
import { MessagePlugin } from 'tdesign-vue-next'

export interface CardDataType {
  id: string
  title: string
  avatar: string
  description: string
  createdTime: string
  cover: string
}

interface ApiResponse {
  code: number
  message: string
  data: CardDataType[]
  total: number
}

// API 调用函数
export const fetchCardData = async (): Promise<CardDataType[]> => {
  try {
    const response = await axios.get<ApiResponse>('/api/get-knowledge-item/')
    console.log('API Response:', response.data)

    // 检查响应状态
    if (response.data.code === 200) {
      return response.data.data || []
    } else {
      console.error('API返回错误:', response.data.message)
      return []
    }
  } catch (error) {
    console.error('Error fetching card data:', error)
    return []
  }
}

export const useCardDataStore = defineStore('CardData', {
  state: () => ({
    allCards: [] as CardDataType[],
    searchKeyword: '',
    loading: false,
    error: null as string | null,
    total: 0
  }),

  actions: {
    async fetchCards() {
      this.loading = true
      this.error = null

      try {
        // 直接调用 API 并处理响应
        const response = await axios.get<ApiResponse>('/api/get-knowledge-item/')

        if (response.data.code === 200) {
          this.allCards = response.data.data || []
          this.total = response.data.total || 0
          console.log(`成功获取 ${this.total} 条卡片数据`)
          MessagePlugin.success(`已加载 ${this.total} 个知识库`)
        } else {
          this.error = response.data.message || '获取数据失败'
          console.error('API返回错误:', this.error)
        }
      } catch (error: any) {
        this.error = error.message || '网络请求失败'
        console.error('获取卡片数据失败:', error)
        this.allCards = []
        this.total = 0
      } finally {
        this.loading = false
      }
    },

    filterCardData(keyword: string) {
      this.searchKeyword = keyword.trim()
    },

    resetFilters() {
      this.searchKeyword = ''
    },

    // 根据ID获取单个卡片
    getCardById(id: string): CardDataType | undefined {
      return this.allCards.find(card => card.id === id)
    },

    // 清空数据
    clearCards() {
      this.allCards = []
      this.total = 0
      this.error = null
    }
  },

  getters: {
    filteredCards(state): CardDataType[] {
      if (!state.searchKeyword) {
        return state.allCards
      }

      const keyword = state.searchKeyword.toLowerCase()
      return state.allCards.filter(
        (card: CardDataType) =>
          card.title.toLowerCase().includes(keyword) ||
          card.description.toLowerCase().includes(keyword)
      )
    },

    // 获取过滤后的卡片数量
    filteredCount(): number {
      return this.filteredCards.length
    },

    // 检查是否有数据
    hasCards(): boolean {
      return this.allCards.length > 0
    },

    // 检查是否正在搜索
    isSearching(state): boolean {
      return state.searchKeyword.trim() !== ''
    }
  }
})
