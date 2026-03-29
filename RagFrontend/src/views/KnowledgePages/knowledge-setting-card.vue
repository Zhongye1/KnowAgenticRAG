<template>
  <div class="bg-white shadow rounded-lg p-6">
    <h2 class="text-xl font-medium mb-4">知识库设置</h2>

    <!-- 加载状态 -->
    <div v-if="configLoading" class="flex items-center justify-center py-8">
      <div class="flex items-center space-x-2">
        <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        <span class="text-gray-600">加载配置中...</span>
      </div>
    </div>

    <!-- 配置内容 -->
    <div v-else>
      <!-- 基本信息设置 -->
      <div class="mb-8">
        <h3 class="text-lg font-medium mb-4">基本信息</h3>
        <div class="grid md:grid-cols-2 md:grid-rows-[auto_1fr] gap-6">
          <!-- 左上：知识库名称 -->
          <div class="md:row-span-1">
            <label class="block text-sm font-medium text-gray-700 mb-1">知识库名称</label>
            <t-input
              v-model="localKbName"
              type="text"
              :class="[
                'w-full border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500',
                errors.name ? 'border-red-300' : 'border-gray-300'
              ]"
              placeholder="请输入知识库名称"
            />
            <p v-if="errors.name" class="text-red-500 text-sm mt-1">{{ errors.name }}</p>
          </div>

          <!-- 右侧：知识库描述（跨两行） -->
          <div class="md:row-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">知识库描述</label>
            <t-textarea
              v-model="localKbDescription"
              :autosize="true"
              :rows="6"
              :class="[
                'w-full border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none',
                errors.description ? 'border-red-300' : 'border-gray-300'
              ]"
              placeholder="请输入知识库描述"
            />
            <p v-if="errors.description" class="text-red-500 text-sm mt-1">
              {{ errors.description }}
            </p>
          </div>

          <!-- 左下：知识库封面 -->
          <div class="md:row-span-1">
            <label class="block text-sm font-medium text-gray-700 mb-2">知识库封面</label>
            <div class="flex items-center space-x-4">
              <div class="w-20 h-20 rounded-md overflow-hidden border border-gray-300">
                <img
                  v-if="localKbImageUrl"
                  :src="localKbImageUrl"
                  alt="封面图片"
                  class="w-full h-full object-cover"
                  @error="handleImageError"
                />
                <div v-else class="w-full h-full bg-gray-100 flex items-center justify-center">
                  <svg
                    class="w-8 h-8 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    ></path>
                  </svg>
                </div>
              </div>
              <div class="flex flex-col space-y-2">
                <input
                  ref="imageInput"
                  type="file"
                  accept="image/*"
                  class="hidden"
                  @change="handleImageUpload"
                />
                <button
                  class="px-4 py-2 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 text-sm"
                  @click="triggerFileInput"
                >
                  上传新封面
                </button>
                <button
                  v-if="localKbImageUrl"
                  class="px-4 py-2 bg-red-50 border border-red-300 rounded-md hover:bg-red-100 text-red-600 text-sm"
                  @click="removeImage"
                >
                  移除封面
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 文本处理设置 -->
      <div class="mb-8">
        <h3 class="text-lg font-medium mb-4">文本处理设置</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">PDF解析器</label>
            <t-select
              v-model="settings.pdfParser"
              class="w-full border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              <t-option value="PyPDFLoader">PyPDFLoader (默认)</t-option>
              <t-option value="PDFParser">PDFParser</t-option>
            </t-select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">DOCX解析器</label>
            <t-select
              v-model="settings.docxParser"
              class="w-full border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              <t-option value="Docx2txtLoader">Docx2txtLoader (默认)</t-option>
            </t-select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">EXCEL解析器</label>
            <t-select
              v-model="settings.excelParser"
              class="w-full border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              <t-option value="Unstructured Excel Loader"
                >Unstructured Excel Loader (默认)</t-option
              >
            </t-select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">CSV解析器</label>
            <t-select
              v-model="settings.csvParser"
              class="w-full border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              <t-option value="CsvLoader">CsvLoader (默认)</t-option>
            </t-select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">TXT解析器</label>
            <t-select
              v-model="settings.txtParser"
              class="w-full border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              <t-option value="TextLoader">TextLoader (默认)</t-option>
            </t-select>
          </div>
          <div></div>

          <h3 class="text-lg font-medium col-span-2 mt-4">高级设置</h3>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">嵌入模型</label>
            <t-select
              v-model="settings.embeddingModel"
              class="w-full border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              <t-option value="sentence-transformers/all-MiniLM-L6-v2">
                sentence-transformers/all-MiniLM-L6-v2</t-option
              >
            </t-select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">分段方法</label>
            <t-select
              v-model="settings.segmentMethod"
              class="w-full border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              @change="handleSegmentMethodChange"
            >
              <t-option value="General">General</t-option>
              <t-option value="Semantic">Semantic</t-option>
              <t-option value="Fixed">Fixed</t-option>
            </t-select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              文本块大小 ({{ settings.textBlockSize }}) PSC
            </label>
            <input
              v-model.number="settings.textBlockSize"
              type="range"
              min="128"
              max="4096"
              step="128"
              class="w-full"
            />
            <div class="flex justify-between text-sm text-gray-500 mt-1">
              <span>128</span>
              <span>4096</span>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">重叠长度</label>
            <t-input
              v-model.number="settings.overlapSize"
              type="number"
              min="0"
              :max="Math.floor(settings.textBlockSize / 2)"
              step="16"
              class="w-full border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div class="mt-4 space-y-3">
          <label class="flex items-center">
            <input
              v-model="settings.convertTableToHtml"
              type="checkbox"
              class="h-4 w-4 text-blue-600 rounded border-gray-300"
            />
            <span class="ml-2 text-sm text-gray-700">将表格内容转换为HTML格式</span>
          </label>

          <label class="flex items-center">
            <input
              v-model="settings.preserveLayout"
              type="checkbox"
              class="h-4 w-4 text-blue-600 rounded border-gray-300"
            />
            <span class="ml-2 text-sm text-gray-700">保持文档原始布局</span>
          </label>

          <label class="flex items-center">
            <input
              v-model="settings.removeHeaders"
              type="checkbox"
              class="h-4 w-4 text-blue-600 rounded border-gray-300"
            />
            <span class="ml-2 text-sm text-gray-700">移除页眉页脚</span>
          </label>
        </div>
      </div>

      <!-- 权限与分享设置 -->
      <div class="mb-8">
        <h3 class="text-lg font-medium mb-4 flex items-center gap-2">
          <svg
            class="w-5 h-5 text-blue-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          权限与分享
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- 知识库类型 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">知识库类型</label>
            <div class="flex gap-3">
              <label
                v-for="t in kbTypeOptions"
                :key="t.value"
                :class="[
                  'flex-1 border rounded-lg p-3 cursor-pointer text-center transition-all',
                  accessSettings.kbType === t.value
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-400 text-gray-600'
                ]"
                @click="accessSettings.kbType = t.value as 'personal' | 'shared' | 'public'"
              >
                <div class="text-lg mb-1">{{ t.icon }}</div>
                <div class="text-sm font-medium">{{ t.label }}</div>
                <div class="text-xs text-gray-500 mt-0.5">{{ t.desc }}</div>
              </label>
            </div>
          </div>

          <!-- 成员权限（共享知识库时显示） -->
          <div v-if="accessSettings.kbType === 'shared'">
            <label class="block text-sm font-medium text-gray-700 mb-2">成员权限设置</label>
            <div class="space-y-2">
              <div
                v-for="role in roleOptions"
                :key="role.value"
                class="flex items-center justify-between p-2 border border-gray-200 rounded-lg"
              >
                <div class="flex items-center gap-2">
                  <span :class="['w-2 h-2 rounded-full', role.color]"></span>
                  <span class="text-sm font-medium">{{ role.label }}</span>
                  <span class="text-xs text-gray-400">{{ role.desc }}</span>
                </div>
                <span class="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-500">{{
                  role.limit
                }}</span>
              </div>
            </div>
          </div>

          <!-- 安全策略 -->
          <div class="md:col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-2">安全策略</label>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
              <label
                v-for="policy in securityPolicies"
                :key="policy.key"
                class="flex items-center gap-2 p-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50"
              >
                <input
                  v-model="(accessSettings as any)[policy.key]"
                  type="checkbox"
                  class="h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                <span class="text-sm text-gray-700">{{ policy.label }}</span>
              </label>
            </div>
          </div>

          <!-- 分享链接 -->
          <div class="md:col-span-2 border border-gray-200 rounded-lg p-4">
            <div class="flex items-center justify-between mb-3">
              <span class="text-sm font-medium text-gray-700">分享链接</span>
              <div class="flex items-center gap-2">
                <t-switch v-model="accessSettings.shareEnabled" size="small" />
                <span class="text-xs text-gray-500">{{
                  accessSettings.shareEnabled ? '已开启' : '已关闭'
                }}</span>
              </div>
            </div>
            <div v-if="accessSettings.shareEnabled" class="space-y-3">
              <div class="flex gap-2">
                <t-input :value="generatedShareLink" readonly class="flex-1 text-xs" />
                <t-button size="small" theme="primary" @click="copyShareLink">复制链接</t-button>
                <t-button size="small" theme="default" @click="showQrCode = !showQrCode"
                  >二维码</t-button
                >
              </div>
              <div class="flex gap-3">
                <div>
                  <label class="block text-xs text-gray-500 mb-1">有效期</label>
                  <t-select v-model="accessSettings.shareExpiry" size="small">
                    <t-option value="7d">7天</t-option>
                    <t-option value="30d">30天</t-option>
                    <t-option value="permanent">永久</t-option>
                  </t-select>
                </div>
                <div>
                  <label class="block text-xs text-gray-500 mb-1">访问密码（可选）</label>
                  <t-input
                    v-model="accessSettings.sharePassword"
                    size="small"
                    placeholder="留空则无需密码"
                  />
                </div>
              </div>
              <!-- 二维码展示 -->
              <div v-if="showQrCode" class="flex justify-center p-3 bg-gray-50 rounded-lg">
                <div class="text-center">
                  <div
                    class="w-32 h-32 bg-white border-2 border-gray-200 rounded-lg flex items-center justify-center mx-auto mb-2"
                  >
                    <div class="text-xs text-gray-400 text-center p-2">
                      <svg viewBox="0 0 100 100" class="w-24 h-24" fill="currentColor">
                        <rect
                          x="10"
                          y="10"
                          width="35"
                          height="35"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="3"
                        />
                        <rect x="20" y="20" width="15" height="15" />
                        <rect
                          x="55"
                          y="10"
                          width="35"
                          height="35"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="3"
                        />
                        <rect x="65" y="20" width="15" height="15" />
                        <rect
                          x="10"
                          y="55"
                          width="35"
                          height="35"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="3"
                        />
                        <rect x="20" y="65" width="15" height="15" />
                        <rect x="55" y="55" width="10" height="10" />
                        <rect x="75" y="55" width="10" height="10" />
                        <rect x="55" y="75" width="10" height="10" />
                        <rect x="75" y="75" width="10" height="10" />
                        <rect x="65" y="65" width="10" height="10" />
                      </svg>
                    </div>
                  </div>
                  <p class="text-xs text-gray-500">扫码访问知识库</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 知识图谱设置 -->
      <!---
            <div class="mb-8">
                <h3 class="text-lg font-medium mb-4">知识图谱设置</h3>

                <div class="mb-4">
                    <label class="flex items-center">
                        <input type="checkbox" v-model="settings.extractKnowledgeGraph"
                            class="h-4 w-4 text-blue-600 rounded border-gray-300" />
                        <span class="ml-2 text-sm text-gray-700">启用知识图谱提取</span>
                    </label>
                    <p class="text-sm text-gray-500 mt-1 ml-6">提取文档中的实体和关系，构建知识图谱</p>
                </div>

                <div v-if="settings.extractKnowledgeGraph" class="pl-6 border-l-2 border-blue-100 space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">图谱方法</label>
                        <t-select v-model="settings.kgMethod"
                            class="w-full  border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
                            <t-option value="General">通用 (适用于大多数文档)</t-option>
                            <t-option value="Advanced">高级 (更精确的实体识别)</t-option>
                            <t-option value="Domain">领域专用 (特定领域优化)</t-option>
                        </t-select>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">实体类型</label>
                        <div class="flex flex-wrap gap-2">
                            <div v-for="entity in entityTypes" :key="entity.value"
                                @click="toggleEntityType(entity.value)" :class="[
                                    'px-3 py-1 rounded-full text-sm cursor-pointer transition-colors',
                                    settings.selectedEntityTypes.includes(entity.value)
                                        ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                        : 'bg-gray-100 text-gray-800 border border-gray-300 hover:bg-gray-200'
                                ]">
                                {{ entity.label }}
                            </div>
                        </div>
                    </div>

                    <div class="space-y-3">
                        <label class="flex items-center">
                            <input type="checkbox" v-model="settings.entityNormalization"
                                class="h-4 w-4 text-blue-600 rounded border-gray-300" />
                            <span class="ml-2 text-sm text-gray-700">实体标准化</span>
                        </label>

                        <label class="flex items-center">
                            <input type="checkbox" v-model="settings.communityReport"
                                class="h-4 w-4 text-blue-600 rounded border-gray-300" />
                            <span class="ml-2 text-sm text-gray-700">生成社区报告</span>
                        </label>

                        <label class="flex items-center">
                            <input type="checkbox" v-model="settings.relationExtraction"
                                class="h-4 w-4 text-blue-600 rounded border-gray-300" />
                            <span class="ml-2 text-sm text-gray-700">关系抽取</span>
                        </label>
                    </div>
                </div>
            </div>-->

      <!-- 操作按钮 -->
      <div class="border-t pt-6 flex justify-between">
        <div>
          <button
            class="px-4 py-2 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 text-gray-700 font-medium"
            @click="resetToDefaults"
          >
            重置为默认
          </button>
        </div>

        <div class="flex space-x-3">
          <button
            :disabled="isLoading"
            class="bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white px-4 py-2 rounded-md font-medium"
            @click="onDeleteClick"
          >
            {{ isLoading ? '删除中...' : '删除知识库' }}
          </button>
          <button
            :disabled="isLoading || !isValid"
            class="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-md font-medium"
            @click="onSaveClick"
          >
            {{ isLoading ? '保存中...' : '保存设置' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { MessagePlugin } from 'tdesign-vue-next'
import { ref, watch, computed, defineProps, defineEmits, onMounted } from 'vue'
//import { useChatImgtore } from '@/store';
import API_ENDPOINTS from '@/utils/apiConfig'
const triggerFileInput = () => {
  imageInput.value?.click()
}

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
//定义pinia
//const useChatImg = useChatImgtore()

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

const imageInput = ref<HTMLInputElement | null>(null)

// ── 权限与分享设置 ──────────────────────────────────
const showQrCode = ref(false)

const accessSettings = ref({
  kbType: 'personal' as 'personal' | 'shared' | 'public',
  shareEnabled: false,
  shareExpiry: '7d',
  sharePassword: '',
  requireApproval: false,
  forbidExport: false,
  watermark: false,
  readOnly: false
})

const kbTypeOptions = [
  { value: 'personal', icon: '🔒', label: '个人', desc: '私密专属' },
  { value: 'shared', icon: '👥', label: '共享', desc: '团队协作' },
  { value: 'public', icon: '🌐', label: '广场', desc: '公开发现' }
]

const roleOptions = [
  { value: 'admin', label: '管理员', desc: '完全控制', color: 'bg-red-500', limit: '最多5名' },
  { value: 'editor', label: '编辑者', desc: '读写权限', color: 'bg-blue-500', limit: '无限制' },
  { value: 'viewer', label: '查看者', desc: '只读权限', color: 'bg-green-500', limit: '无限制' }
]

const securityPolicies = [
  { key: 'requireApproval', label: '加入审批' },
  { key: 'forbidExport', label: '禁止导出' },
  { key: 'watermark', label: '添加水印' },
  { key: 'readOnly', label: '全员只读' }
]

const generatedShareLink = computed(() => {
  if (!accessSettings.value.shareEnabled) return ''
  const base = window.location.origin
  const expiry = accessSettings.value.shareExpiry
  const pwd = accessSettings.value.sharePassword ? `&pw=1` : ''
  return `${base}/share/kb/${props.kbId}?exp=${expiry}${pwd}`
})

const copyShareLink = () => {
  if (generatedShareLink.value) {
    navigator.clipboard.writeText(generatedShareLink.value).then(() => {
      import('tdesign-vue-next').then(({ MessagePlugin }) => {
        MessagePlugin.success('链接已复制到剪贴板')
      })
    })
  }
}
// ──────────────────────────────────────────────────────

// 实体类型选项
/**
const entityTypes = ref([
    { value: 'PERSON', label: '人物' },
    { value: 'ORGANIZATION', label: '组织' },
    { value: 'LOCATION', label: '地点' },
    { value: 'EVENT', label: '事件' },
    { value: 'PRODUCT', label: '产品' },
    { value: 'CONCEPT', label: '概念' },
    { value: 'TIME', label: '时间' },
    { value: 'MONEY', label: '金额' }
]);*/

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

// 处理分段方法变化
const handleSegmentMethodChange = () => {
  if (settings.value.segmentMethod === 'Fixed') {
    settings.value.textBlockSize = 512
  }
}

// 切换实体类型
/**
const toggleEntityType = (entityType: string) => {
    const index = settings.value.selectedEntityTypes.indexOf(entityType);
    if (index > -1) {
        settings.value.selectedEntityTypes.splice(index, 1);
    } else {
        settings.value.selectedEntityTypes.push(entityType);
    }
};*/

// 处理图片上传
const handleImageUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file) return

  // 校验文件
  if (file.size > 5 * 1024 * 1024) {
    // 5MB limit
    alert('图片大小不能超过5MB')
    return
  }

  if (!file.type.startsWith('image/')) {
    alert('请选择图片文件')
    return
  }

  // 创建本地预览
  const reader = new FileReader()
  reader.onload = e => {
    localKbImageUrl.value = e.target?.result as string
  }
  reader.readAsDataURL(file)

  // 上传到后端
  await uploadImage(file)
}

// 上传图片到后端
async function uploadImage(file: File) {
  isLoading.value = true

  try {
    const formData = new FormData()
    formData.append('image', file)
    formData.append('KLB_id', props.kbId)

    console.log('KLB_id:', props.kbId)

    const response = await fetch('/api/upload-cover', {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      throw new Error('上传图片失败')
    }

    const data = await response.json()
    const imageUrl = data.imageUrl.startsWith('http')
      ? data.imageUrl
      : API_ENDPOINTS.USER.AVATAR(data.imageUrl)
    localKbImageUrl.value = imageUrl

    console.log('图片上传成功:', data.imageUrl)

    // 触发上传成功事件
    emit('image-upload', file, data.imageUrl)
  } catch (error) {
    console.error('上传图片失败:', error)
    alert('上传图片失败，请重试')
  } finally {
    isLoading.value = false
  }
}

// 移除图片
const removeImage = () => {
  localKbImageUrl.value = ''
}

// 重置为默认设置
const resetToDefaults = () => {
  if (confirm('确定要重置为默认设置吗？这将丢失所有自定义配置。')) {
    settings.value = { ...defaultSettings }
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

// 删除知识库
const onDeleteClick = async () => {
  try {
    await emit('delete')
  } catch (error) {
    console.error('删除失败:', error)
  } finally {
    isLoading.value = false
  }
}

// 图片加载错误处理
const handleImageError = () => {
  console.error('图片加载失败:', localKbImageUrl.value)
  // 设置为默认图片或清空
  localKbImageUrl.value = ''
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
