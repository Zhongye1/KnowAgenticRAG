<template>
  <!-- 知识图谱设置 -->
  <div class="mb-8">
    <h3 class="text-lg font-medium mb-4">知识图谱</h3>

    <div class="mb-4">
      <div class="flex items-center justify-between">
        <div>
          <span class="text-sm text-gray-700">启用知识图谱提取</span>
          <p class="text-sm text-gray-500 mt-1">提取文档中的实体和关系，构建知识图谱</p>
        </div>
        <t-switch v-model="settings.extractKnowledgeGraph" size="large" />
      </div>
    </div>

    <div v-if="settings.extractKnowledgeGraph" class="pl-6 border-l-2 border-blue-100 space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">图谱方法</label>
        <t-select
          v-model="settings.kgMethod"
          class="w-full border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
        >
          <t-option value="General">通用 (适用于大多数文档)</t-option>
          <t-option value="Advanced">高级 (更精确的实体识别)</t-option>
          <t-option value="Domain">领域专用 (特定领域优化)</t-option>
        </t-select>
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-2">实体类型</label>
        <div class="flex flex-wrap gap-2">
          <div
            v-for="entity in entityTypes"
            :key="entity.value"
            :class="[
              'px-3 py-1 rounded-full text-sm cursor-pointer transition-colors',
              settings.selectedEntityTypes.includes(entity.value)
                ? 'bg-blue-100 text-blue-800 border border-blue-300'
                : 'bg-gray-100 text-gray-800 border border-gray-300 hover:bg-gray-200'
            ]"
            @click="toggleEntityType(entity.value)"
          >
            {{ entity.label }}
          </div>
        </div>
      </div>

      <div class="space-y-3">
        <label class="flex items-center">
          <input
            v-model="settings.entityNormalization"
            type="checkbox"
            class="h-4 w-4 text-blue-600 rounded border-gray-300"
          />
          <span class="ml-2 text-sm text-gray-700">实体标准化</span>
        </label>

        <label class="flex items-center">
          <input
            v-model="settings.communityReport"
            type="checkbox"
            class="h-4 w-4 text-blue-600 rounded border-gray-300"
          />
          <span class="ml-2 text-sm text-gray-700">生成社区报告</span>
        </label>

        <label class="flex items-center">
          <input
            v-model="settings.relationExtraction"
            type="checkbox"
            class="h-4 w-4 text-blue-600 rounded border-gray-300"
          />
          <span class="ml-2 text-sm text-gray-700">关系抽取</span>
        </label>
      </div>
      <!-- 操作按钮 -->
      <div class="border-t pt-6 flex justify-between">
        <div class="flex space-x-3">
          <button
            :disabled="isLoading || !isValid"
            class="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-md font-medium"
            @click="onSaveClick"
          >
            {{ isLoading ? '保存中...' : '保存设置' }}
          </button>
        </div>
      </div>
      <graphMain />
    </div>
  </div>
</template>

<script setup lang="ts">
import { MessagePlugin } from 'tdesign-vue-next'
import { ref, watch, computed, defineProps, defineEmits, onMounted } from 'vue'
import graphMain from '@/components/graph-unit/graph-main.vue'

import API_ENDPOINTS from '@/utils/apiConfig'

interface KnowledgeBaseSettings {
  pdfParser: string
  docxParser: string
  excelParser: string
  csvParser: string
  txtParser: string
  embeddingModel: string
  segmentMethod: string
  textBlockSize: number
  overlapSize: number
  convertTableToHtml: boolean
  preserveLayout: boolean
  removeHeaders: boolean
  extractKnowledgeGraph: boolean
  kgMethod: string
  selectedEntityTypes: string[]
  entityNormalization: boolean
  communityReport: boolean
  relationExtraction: boolean
  vectorDimension: number
  similarityThreshold: number
}

// API响应类型定义
interface KnowledgeBaseConfig {
  id: string
  title: string
  name: string
  avatar: string
  description: string
  createdTime: string
  cover: string
  embedding_model: string
  chunk_size: number
  chunk_overlap: number
  vector_dimension: number
  pdfParser: string
  docxParser: string
  excelParser: string
  csvParser: string
  txtParser: string
  segmentMethod: string
  similarity_threshold: number
  convert_table_to_html: boolean
  preserve_layout: boolean
  remove_headers: boolean
  extract_knowledge_graph: boolean
  kg_method: string
  selected_entity_types: string[]
  entity_normalization: boolean
  community_report: boolean
  relation_extraction: boolean
}

interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

// 定义组件的输入属性
const props = defineProps({
  kbName: {
    type: String,
    default: ''
  },
  kbDescription: {
    type: String,
    default: ''
  },
  kbImageUrl: {
    type: String,
    default: ''
  },
  kbId: {
    type: String,
    required: true
  },
  initialSettings: {
    type: Object as () => Partial<KnowledgeBaseSettings>,
    default: () => ({})
  }
})

// 定义组件可触发的事件
const emit = defineEmits(['save', 'delete', 'image-upload'])

// 状态管理
const isLoading = ref(false)
const configLoading = ref(true)
const errors = ref<Record<string, string>>({})

// 创建本地响应式数据 - 初始为空，等待接口数据
const localKbName = ref('')
const localKbDescription = ref('')
const localKbImageUrl = ref('')

// 实体类型选项
const entityTypes = ref([
  { value: 'PERSON', label: '人物' },
  { value: 'ORGANIZATION', label: '组织' },
  { value: 'LOCATION', label: '地点' },
  { value: 'EVENT', label: '事件' },
  { value: 'PRODUCT', label: '产品' },
  { value: 'CONCEPT', label: '概念' },
  { value: 'TIME', label: '时间' },
  { value: 'MONEY', label: '数额' }
])

// 默认设置
const defaultSettings: KnowledgeBaseSettings = {
  pdfParser: 'PyPDFLoader',
  docxParser: 'Docx2txtLoader',
  excelParser: 'Unstructured Excel Loader',
  csvParser: 'CsvLoader',
  txtParser: 'TextLoader',
  embeddingModel: 'sentence-transformers/all-MiniLM-L6-v2',
  segmentMethod: 'General',
  textBlockSize: 512,
  overlapSize: 64,
  convertTableToHtml: true,
  preserveLayout: false,
  removeHeaders: true,
  extractKnowledgeGraph: false,
  kgMethod: 'General',
  selectedEntityTypes: ['PERSON', 'ORGANIZATION', 'LOCATION'],
  entityNormalization: true,
  communityReport: false,
  relationExtraction: true,
  vectorDimension: 768,
  similarityThreshold: 0.7
}

// 设置数据 - 先使用默认值，等待接口数据更新
const settings = ref<KnowledgeBaseSettings>({ ...defaultSettings })

// 获取知识库配置数据
const fetchKnowledgeBaseConfig = async () => {
  if (!props.kbId) return

  try {
    configLoading.value = true

    const response = await fetch(API_ENDPOINTS.KNOWLEDGE.GET_ITEM(props.kbId), {
      headers: {
        accept: 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`获取配置失败: ${response.status}`)
    }

    const responseData: ApiResponse<KnowledgeBaseConfig> = await response.json()

    if (responseData.code === 200 && responseData.data) {
      const config = responseData.data

      // 更新基本信息
      localKbName.value = config.title || config.name || ''
      localKbDescription.value = config.description || ''
      localKbImageUrl.value = config.cover || ''

      // 更新设置数据 - 使用后端数据覆盖默认值
      settings.value = {
        // 解析器设置
        pdfParser: config.pdfParser || defaultSettings.pdfParser,
        docxParser: config.docxParser || defaultSettings.docxParser,
        excelParser: config.excelParser || defaultSettings.excelParser,
        csvParser: config.csvParser || defaultSettings.csvParser,
        txtParser: config.txtParser || defaultSettings.txtParser,

        // 嵌入和分段设置
        embeddingModel: config.embedding_model || defaultSettings.embeddingModel,
        segmentMethod: config.segmentMethod || defaultSettings.segmentMethod,
        textBlockSize: config.chunk_size || defaultSettings.textBlockSize,
        overlapSize: config.chunk_overlap || defaultSettings.overlapSize,

        // 高级设置
        vectorDimension: config.vector_dimension || defaultSettings.vectorDimension,
        similarityThreshold: config.similarity_threshold || defaultSettings.similarityThreshold,
        convertTableToHtml:
          config.convert_table_to_html !== undefined
            ? config.convert_table_to_html
            : defaultSettings.convertTableToHtml,
        preserveLayout:
          config.preserve_layout !== undefined
            ? config.preserve_layout
            : defaultSettings.preserveLayout,
        removeHeaders:
          config.remove_headers !== undefined
            ? config.remove_headers
            : defaultSettings.removeHeaders,

        // 知识图谱设置
        extractKnowledgeGraph:
          config.extract_knowledge_graph !== undefined
            ? config.extract_knowledge_graph
            : defaultSettings.extractKnowledgeGraph,
        kgMethod: config.kg_method || defaultSettings.kgMethod,
        selectedEntityTypes: config.selected_entity_types || defaultSettings.selectedEntityTypes,
        entityNormalization:
          config.entity_normalization !== undefined
            ? config.entity_normalization
            : defaultSettings.entityNormalization,
        communityReport:
          config.community_report !== undefined
            ? config.community_report
            : defaultSettings.communityReport,
        relationExtraction:
          config.relation_extraction !== undefined
            ? config.relation_extraction
            : defaultSettings.relationExtraction
      }

      console.log('知识库配置加载成功:', config)
    } else {
      console.error('API返回错误:', responseData.message)
      setFallbackData()
    }
  } catch (error) {
    console.error('获取知识库配置失败:', error)
    setFallbackData()
  } finally {
    configLoading.value = false
  }
}

// 设置备选数据
const setFallbackData = () => {
  // 如果有props传入的数据，使用props数据作为备选
  localKbName.value = props.kbName || '未知知识库'
  localKbDescription.value = props.kbDescription || '暂无描述'
  localKbImageUrl.value = props.kbImageUrl || ''

  // 设置保持默认值（已经在初始化时设置）
  settings.value = { ...defaultSettings, ...props.initialSettings }
}

// 监听 props 变化（保留原有逻辑，但优先级低于接口数据）
watch(
  () => props.kbName,
  newVal => {
    if (!configLoading.value && newVal && !localKbName.value) {
      localKbName.value = newVal
    }
  }
)

watch(
  () => props.kbDescription,
  newVal => {
    if (!configLoading.value && newVal && !localKbDescription.value) {
      localKbDescription.value = newVal
    }
  }
)

watch(
  () => props.kbImageUrl,
  newVal => {
    if (!configLoading.value && newVal && !localKbImageUrl.value) {
      localKbImageUrl.value = newVal
    }
  }
)

// 表单验证
const isValid = computed(() => {
  return validateForm() && Object.keys(errors.value).length === 0
})

const validateForm = () => {
  errors.value = {}

  if (!localKbName.value.trim()) {
    errors.value.name = '知识库名称不能为空'
  }

  if (!localKbDescription.value.trim()) {
    errors.value.description = '知识库描述不能为空'
  }

  if (settings.value.textBlockSize < 128) {
    errors.value.textBlockSize = '文本块大小不能小于128'
  }

  return Object.keys(errors.value).length === 0
}

// 切换实体类型
const toggleEntityType = (entityType: string) => {
  const index = settings.value.selectedEntityTypes.indexOf(entityType)
  if (index > -1) {
    settings.value.selectedEntityTypes.splice(index, 1)
  } else {
    settings.value.selectedEntityTypes.push(entityType)
  }
}

// 保存设置
const onSaveClick = async () => {
  if (!validateForm()) return

  isLoading.value = true

  try {
    // 构建要发送到后端的配置数据
    const configData = {
      // 基本信息
      name: localKbName.value,
      description: localKbDescription.value,

      // 文本处理设置
      pdfParser: settings.value.pdfParser,
      docxParser: settings.value.docxParser,
      excelParser: settings.value.excelParser,
      csvParser: settings.value.csvParser,
      txtParser: settings.value.txtParser,

      // 分段和嵌入设置
      embedding_model: settings.value.embeddingModel,
      segmentMethod: settings.value.segmentMethod,
      chunk_size: settings.value.textBlockSize,
      chunk_overlap: settings.value.overlapSize,

      // 其他高级设置
      vector_dimension: settings.value.vectorDimension,
      similarity_threshold: settings.value.similarityThreshold,
      convert_table_to_html: settings.value.convertTableToHtml,
      preserve_layout: settings.value.preserveLayout,
      remove_headers: settings.value.removeHeaders,

      // 知识图谱设置
      extract_knowledge_graph: settings.value.extractKnowledgeGraph,
      kg_method: settings.value.kgMethod,
      selected_entity_types: settings.value.selectedEntityTypes,
      entity_normalization: settings.value.entityNormalization,
      community_report: settings.value.communityReport,
      relation_extraction: settings.value.relationExtraction
    }

    // 发送配置到后端
    const response = await fetch(`/api/update-knowledgebase-config/${props.kbId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(configData)
    })

    if (!response.ok) {
      throw new Error(`更新配置失败: ${response.status}`)
    }

    const responseData = await response.json()

    if (responseData.success) {
      console.log('配置更新成功:', responseData.data)
      MessagePlugin.success('知识库配置已更新成功！')

      // 触发父组件的保存事件
      emit('save', {
        name: localKbName.value,
        description: localKbDescription.value,
        imageUrl: localKbImageUrl.value,
        settings: settings.value
      })
    } else {
      throw new Error(responseData.message || '更新失败')
    }
  } catch (error) {
    console.error('保存配置失败:', error)
    MessagePlugin.error('保存配置失败')
  } finally {
    isLoading.value = false
  }
}

// 组件挂载时获取配置数据
onMounted(async () => {
  await fetchKnowledgeBaseConfig()
})
</script>

<style scoped>
/* 自定义样式 */
.transition-colors {
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;
}

input[type='range'] {
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
  outline: none;
}

input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  background: #3b82f6;
  border-radius: 50%;
  cursor: pointer;
}

input[type='range']::-moz-range-thumb {
  width: 18px;
  height: 18px;
  background: #3b82f6;
  border-radius: 50%;
  cursor: pointer;
  border: none;
}

/* 加载动画 */
@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
</style>
