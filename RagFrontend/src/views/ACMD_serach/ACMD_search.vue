<template>
  <div class="academic-search-page flex flex-col md:flex-row p-4 md:p-6 max-w-full mx-auto">
    <!-- 侧边栏 -->
    <div class="w-full md:w-64 md:mr-6 mb-6 md:mb-0">
      <t-card title="搜索选项" class="h-full">
        <div class="space-y-6">
          <!-- 结果数量 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">结果数量</label>
            <t-select
              v-model="pageSize"
              :options="pageSizeOptions"
              style="width: 100%"
              @change="handlePageSizeChange"
            />
          </div>

          <!-- 包含字段 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">包含字段</label>
            <div class="gird row-span-4 space-y-2">
              <t-checkbox v-model="includeTitle" label="标题" />
              <t-checkbox v-model="includeAuthors" label="作者" />
              <t-checkbox v-model="includeYear" label="年份" />
              <t-checkbox v-model="includeAbstract" label="摘要" />
            </div>
          </div>

          <!-- 发表年份范围 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">发表年份范围</label>
            <div class="flex items-center gap-2">
              <t-input
                v-model="yearFrom"
                placeholder="起始年份"
                type="number"
                style="width: 100%"
              />
            </div>
            <div class="flex items-center justify-center my-1">
              <span>-</span>
            </div>
            <div class="flex items-center gap-2">
              <t-input v-model="yearTo" placeholder="结束年份" type="number" style="width: 100%" />
            </div>
          </div>

          <!-- 排序方式 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">排序方式</label>
            <t-select v-model="sortBy" :options="sortOptions" style="width: 100%" />
          </div>
        </div>
      </t-card>
    </div>

    <!-- 主内容区域 -->
    <div class="flex-1 min-w-0">
      <t-card title="学术搜索 beta (服务提供：lensAPI)" class="mb-6">
        <div class="flex flex-col md:flex-row gap-3 mb-4">
          <t-input
            v-model="searchQuery"
            placeholder="请输入搜索关键词，例如：machine learning"
            class="flex-1"
            @enter="performSearch"
          />
          <t-button
            theme="primary"
            :loading="searchLoading"
            class="w-full md:w-auto"
            @click="performSearch"
          >
            搜索
          </t-button>
        </div>
      </t-card>

      <div class="results-container rounded-lg border border-gray-200 bg-white max-h-[60vh]">
        <t-loading :loading="searchLoading">
          <div v-if="searchResults.length > 0" class="overflow-hidden">
            <div class="px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm text-gray-500">
              找到 {{ totalResults }} 条结果，耗时 {{ searchTime }} 毫秒
            </div>

            <t-list class="">
              <t-list-item
                v-for="(paper, index) in searchResults"
                :key="index"
                class="border-b border-gray-100 last:border-b-0"
              >
                <t-card
                  class="rounded-none border-0 shadow-none hover:bg-gray-50 transition-colors duration-200"
                >
                  <template #title>
                    <h3 class="text-lg font-semibold text-blue-600 mb-2">
                      {{ paper.title || '无标题' }}
                    </h3>
                  </template>

                  <div class="mt-2 space-y-2">
                    <div v-if="paper.authors && paper.authors.length > 0">
                      <span class="font-medium text-gray-700">作者:</span>
                      <span class="ml-2 text-gray-600">
                        {{ formatAuthors(paper.authors) }}
                      </span>
                    </div>

                    <div class="flex flex-wrap items-center gap-2">
                      <div v-if="paper.year" class="flex items-center">
                        <t-tag theme="primary" variant="light">
                          <template #icon>
                            <t-icon name="calendar" />
                          </template>
                          {{ paper.year }}
                        </t-tag>
                      </div>

                      <div v-if="paper.sourceTitle" class="flex items-center">
                        <t-tag theme="success" variant="light">
                          <template #icon>
                            <t-icon name="book" />
                          </template>
                          {{ paper.sourceTitle }}
                        </t-tag>
                      </div>

                      <div
                        v-if="paper.scholarlyCitationsCount !== undefined"
                        class="flex items-center"
                      >
                        <t-tag theme="warning" variant="light">
                          <template #icon>
                            <t-icon name="link" />
                          </template>
                          引用: {{ paper.scholarlyCitationsCount }}
                        </t-tag>
                      </div>
                    </div>

                    <div v-if="paper.abstract" class="mt-3">
                      <span class="font-medium text-gray-700">摘要:</span>
                      <p class="mt-1 text-gray-600 text-sm leading-relaxed">
                        {{ truncateAbstract(paper.abstract, 300) }}
                      </p>
                    </div>

                    <div class="flex flex-wrap gap-2 mt-3">
                      <t-button size="small" variant="outline" @click="viewPaperDetails(paper)">
                        查看详情
                      </t-button>

                      <t-button size="small" variant="outline" @click="exportPaper(paper)">
                        导出
                      </t-button>
                    </div>
                  </div>
                </t-card>
              </t-list-item>
            </t-list>

            <div class="flex justify-between items-center py-4 bg-white px-4">
              <t-pagination
                v-model:current="currentPage"
                :total="totalResults"
                :page-size="pageSize"
                @change="handlePageChange"
              />
            </div>
          </div>

          <div
            v-else-if="!searchLoading && searchPerformed"
            class="flex flex-col items-center justify-center py-12"
          >
            <t-empty description="未找到相关结果" />
            <p class="mt-4 text-gray-500 text-center max-w-md">
              尝试使用其他关键词或减少筛选条件来获得更好的搜索结果
            </p>
          </div>

          <div
            v-else-if="!searchLoading && !searchPerformed"
            class="flex flex-col items-center justify-center p-5 h-420"
          >
            <t-icon name="search" size="36px" class="text-gray-300 mb-4" />
            <p class="text-gray-500 text-center">输入关键词开始学术搜索</p>
            <div class="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl w-full">
              <t-card
                v-for="example in exampleSearches"
                :key="example.query"
                class="cursor-pointer hover:shadow-md transition-shadow"
                @click="performExampleSearch(example.query)"
              >
                <template #title>
                  <h4 class="font-medium">{{ example.title }}</h4>
                </template>
                <p class="text-sm text-gray-500">{{ example.query }}</p>
              </t-card>
            </div>
          </div>
        </t-loading>
      </div>

      <!-- 论文详情弹窗 -->
      <t-dialog v-model:visible="showDetailDialog" header="论文详情" width="800px" :footer="false">
        <div v-if="selectedPaper" class="space-y-4">
          <h2 class="text-xl font-bold text-blue-600">{{ selectedPaper.title }}</h2>

          <div class="flex flex-wrap gap-2">
            <t-tag v-if="selectedPaper.year" theme="primary" variant="light">{{
              selectedPaper.year
            }}</t-tag>
            <t-tag v-if="selectedPaper.sourceTitle" theme="success" variant="light">{{
              selectedPaper.sourceTitle
            }}</t-tag>
            <t-tag
              v-if="selectedPaper.scholarlyCitationsCount !== undefined"
              theme="warning"
              variant="light"
            >
              引用: {{ selectedPaper.scholarlyCitationsCount }}
            </t-tag>
          </div>

          <div v-if="selectedPaper.authors && selectedPaper.authors.length > 0">
            <h3 class="font-medium text-gray-700">作者</h3>
            <p class="mt-1">{{ formatAuthors(selectedPaper.authors) }}</p>
          </div>

          <div v-if="selectedPaper.abstract">
            <h3 class="font-medium text-gray-700">摘要</h3>
            <p class="mt-1 text-gray-600">{{ selectedPaper.abstract }}</p>
          </div>

          <div v-if="selectedPaper.lensId">
            <h3 class="font-medium text-gray-700">Lens ID</h3>
            <p class="mt-1 font-mono text-sm">{{ selectedPaper.lensId }}</p>
          </div>
        </div>
      </t-dialog>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import axios from 'axios'
import { Icon as TIcon } from 'tdesign-icons-vue-next'
import { MessagePlugin } from 'tdesign-vue-next'

// 搜索相关状态
const searchQuery = ref('')
const searchLoading = ref(false)
const searchResults = ref<any[]>([])
const searchPerformed = ref(false)
const totalResults = ref(0)
const searchTime = ref(0)

// 分页相关
const currentPage = ref(1)
const pageSize = ref(10)
const pageSizeOptions = [
  { label: '5', value: 5 },
  { label: '10', value: 10 },
  { label: '20', value: 20 },
  { label: '50', value: 50 }
]

// 高级搜索选项
const yearFrom = ref<string>('')
const yearTo = ref<string>('')
const sortBy = ref('relevance')
const sortOptions = [
  { label: '相关性', value: 'relevance' },
  { label: '发表年份（降序）', value: 'year_desc' },
  { label: '发表年份（升序）', value: 'year_asc' },
  { label: '引用次数（降序）', value: 'citations_desc' }
]

// 包含字段选项
const includeTitle = ref(true)
const includeAuthors = ref(true)
const includeYear = ref(true)
const includeAbstract = ref(false)

// 弹窗和详情
const showDetailDialog = ref(false)
const selectedPaper = ref<any>(null)

// 示例搜索
const exampleSearches = [
  { title: '机器学习', query: 'machine learning' },
  { title: '人工智能', query: 'artificial intelligence' },
  { title: '深度学习', query: 'deep learning' },
  { title: '自然语言处理', query: 'natural language processing' },
  { title: '计算机视觉', query: 'computer vision' },
  { title: '数据挖掘', query: 'data mining' }
]

// Lens API 配置
const API_KEY = '7r8qSDoCgJDv' + 'RmCJfZ5PgQZ5w9KAX3vUWHzpr' + 'INnghzihgah75zu'
const API_URL = '/lens-api/scholarly/search' // 使用 Vite 代理路径

// 格式化作者列表
const formatAuthors = (authors: any[]) => {
  if (!authors || authors.length === 0) return '未知作者'

  const authorNames = authors.slice(0, 5).map(author => {
    if (author.fullName) return author.fullName
    if (author.firstName && author.lastName) return `${author.firstName} ${author.lastName}`
    if (author.first_name && author.last_name) return `${author.first_name} ${author.last_name}`
    if (author.firstName) return author.firstName
    if (author.first_name) return author.first_name
    if (author.lastName) return author.lastName
    if (author.last_name) return author.last_name
    return '未知作者'
  })

  const result = authorNames.join(', ')
  return authors.length > 5 ? `${result} 等` : result
}

// 截断摘要
const truncateAbstract = (abstract: string, maxLength: number) => {
  if (!abstract) return ''
  if (abstract.length <= maxLength) return abstract
  return abstract.substring(0, maxLength) + '...'
}

// 构建请求字段
const buildIncludeFields = () => {
  const fields: string[] = []
  if (includeTitle.value) fields.push('title')
  if (includeAuthors.value) fields.push('authors')
  if (includeYear.value) fields.push('year_published')
  if (includeAbstract.value) fields.push('abstract')
  fields.push('source.title', 'scholarly_citations_count', 'lens_id')
  return fields
}

// 构建查询条件
const buildQuery = () => {
  let query: any = {}

  if (searchQuery.value) {
    query.query = {
      bool: {
        must: [
          {
            match: {
              _all: searchQuery.value
            }
          }
        ]
      }
    }

    // 添加年份范围过滤
    if (yearFrom.value || yearTo.value) {
      const rangeQuery: any = { range: { year_published: {} } }
      if (yearFrom.value) {
        rangeQuery.range.year_published.gte = parseInt(yearFrom.value)
      }
      if (yearTo.value) {
        rangeQuery.range.year_published.lte = parseInt(yearTo.value)
      }
      query.query.bool.filter = [rangeQuery]
    }
  }

  return query
}

// 构建排序条件
const buildSort = () => {
  switch (sortBy.value) {
    case 'year_desc':
      return [{ year_published: 'desc' }]
    case 'year_asc':
      return [{ year_published: 'asc' }]
    case 'citations_desc':
      return [{ scholarly_citations_count: 'desc' }]
    default:
      return []
  }
}

// 执行搜索
const performSearch = async () => {
  if (!searchQuery.value.trim()) {
    return
  }

  searchLoading.value = true
  searchPerformed.value = true
  const startTime = performance.now()

  try {
    const payload: any = {
      query: searchQuery.value,
      size: pageSize.value,
      from: (currentPage.value - 1) * pageSize.value,
      include: buildIncludeFields(),
      sort: buildSort()
    }

    // 使用 Vite 代理路径
    const response = await axios.post(API_URL, payload, {
      headers: {
        Authorization: API_KEY,
        'Content-Type': 'application/json'
      }
    })

    if (response.data.data) {
      searchResults.value = response.data.data.map((item: any) => ({
        title: item.title,
        authors: item.authors,
        year: item.year_published,
        abstract: item.abstract,
        sourceTitle: item.source?.title,
        scholarlyCitationsCount: item.scholarly_citations_count,
        lensId: item.lens_id
      }))
      totalResults.value = response.data.total || 0
    } else {
      searchResults.value = []
      totalResults.value = 0
    }

    searchTime.value = Math.round(performance.now() - startTime)
  } catch (error) {
    console.error('搜索出错:', error)
    MessagePlugin.error('搜索出错，请稍后重试')
    searchResults.value = []
    totalResults.value = 0
  } finally {
    searchLoading.value = false
  }
}

// 执行示例搜索
const performExampleSearch = (query: string) => {
  searchQuery.value = query
  performSearch()
}

// 查看论文详情
const viewPaperDetails = (paper: any) => {
  selectedPaper.value = paper
  showDetailDialog.value = true
}

// 导出论文信息
const exportPaper = (paper: any) => {
  const content = `
标题: ${paper.title}
作者: ${formatAuthors(paper.authors)}
年份: ${paper.year}
期刊: ${paper.sourceTitle}
引用次数: ${paper.scholarlyCitationsCount}
摘要: ${paper.abstract}
Lens ID: ${paper.lensId}
  `.trim()

  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${paper.title || '论文'}.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  MessagePlugin.success('导出成功')
}

// 处理分页变化
const handlePageChange = (page: number) => {
  currentPage.value = page
  performSearch()
}

// 处理每页数量变化
const handlePageSizeChange = () => {
  currentPage.value = 1
  performSearch()
}
</script>

<style scoped>
.academic-search-page {
  min-height: calc(100vh - 100px);
}

.results-container {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* 自定义滚动条样式 */
:deep(.t-list)::-webkit-scrollbar {
  width: 6px;
}

:deep(.t-list)::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 10px;
}

:deep(.t-list)::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 10px;
}

:deep(.t-list)::-webkit-scrollbar-thumb:hover {
  background: #a1a1a1;
}

/* 响应式调整 */
@media (max-width: 768px) {
  .results-container {
    margin: 0 -1rem;
  }

  :deep(.t-list) {
    max-height: 50vh;
  }

  :deep(.t-card__header) {
    padding: 12px 16px;
  }

  :deep(.t-card__body) {
    padding: 12px 16px;
  }
}

@media (min-width: 768px) {
  :deep(.t-list) {
    max-height: 60vh;
  }
}
</style>
