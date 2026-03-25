<template>
  <div class="settings-page">
    <div class="settings-tabs">
      <button v-for="tab in tabs" :key="tab.id"
        :class="['tab-btn', { active: activeTab === tab.id }]"
        @click="activeTab = tab.id">
        <span class="tab-icon">{{ tab.icon }}</span>
        {{ tab.label }}
      </button>
    </div>

    <!-- API Key 管理 -->
    <div v-if="activeTab === 'apikeys'" class="tab-content">
      <div class="section-header">
        <h2>开放 API Key 管理</h2>
        <p class="section-desc">允许外部系统通过 API Key 调用 RAGF 接口</p>
        <button class="btn-primary" @click="showCreateModal = true">+ 创建 API Key</button>
      </div>

      <!-- Key 列表 -->
      <div v-if="keysLoading" class="skeleton-list">
        <div v-for="i in 3" :key="i" class="skeleton-item"></div>
      </div>
      <div v-else class="key-list">
        <div v-if="apiKeys.length === 0" class="empty-state">
          <div class="empty-icon">🔑</div>
          <p>暂无 API Key，点击「创建 API Key」开始</p>
        </div>
        <div v-for="key in apiKeys" :key="key.id" class="key-card">
          <div class="key-card__info">
            <div class="key-card__name">{{ key.name }}</div>
            <div class="key-card__prefix">{{ key.key_prefix }}</div>
            <div class="key-card__meta">
              <span>使用次数: {{ key.usage_count }}</span>
              <span v-if="key.expires_at">· 过期: {{ formatDate(key.expires_at) }}</span>
              <span v-else>· 永不过期</span>
              <span v-if="key.last_used_at">· 最后使用: {{ formatDate(key.last_used_at) }}</span>
            </div>
          </div>
          <div class="key-card__actions">
            <span :class="['status-badge', key.is_active ? 'badge--active' : 'badge--inactive']">
              {{ key.is_active ? '启用' : '禁用' }}
            </span>
            <button class="btn-toggle" @click="toggleKey(key.id)">
              {{ key.is_active ? '禁用' : '启用' }}
            </button>
            <button class="btn-delete" @click="deleteKey(key.id)">删除</button>
          </div>
        </div>
      </div>

      <!-- 创建弹窗 -->
      <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
        <div class="modal-card">
          <h3>创建 API Key</h3>
          <div class="form-group">
            <label>名称 *</label>
            <input v-model="newKey.name" placeholder="如：我的应用集成" class="form-input" />
          </div>
          <div class="form-group">
            <label>描述</label>
            <input v-model="newKey.description" placeholder="用途说明..." class="form-input" />
          </div>
          <div class="form-group">
            <label>有效期（天，空=永久）</label>
            <input v-model.number="newKey.expires_days" type="number" placeholder="如：365" class="form-input" />
          </div>
          <div class="form-group">
            <label>每日调用限额</label>
            <input v-model.number="newKey.rate_limit" type="number" class="form-input" />
          </div>
          <div class="modal-actions">
            <button class="btn-cancel" @click="showCreateModal = false">取消</button>
            <button class="btn-confirm" @click="createKey">创建</button>
          </div>
        </div>
      </div>

      <!-- 新建成功展示 -->
      <div v-if="newCreatedKey" class="key-reveal-box">
        <h4>🎉 API Key 创建成功</h4>
        <p>请立即复制保存，此密钥不会再次显示：</p>
        <div class="key-reveal-value">
          {{ newCreatedKey }}
          <button class="copy-btn" @click="copyKey">复制</button>
        </div>
        <button class="btn-close-reveal" @click="newCreatedKey = ''">我已保存，关闭</button>
      </div>
    </div>

    <!-- 数据源管理 -->
    <div v-if="activeTab === 'datasources'" class="tab-content">
      <div class="section-header">
        <h2>多数据源管理</h2>
        <p class="section-desc">连接 OSS / S3 / 数据库等外部数据源，自动同步到知识库</p>
        <button class="btn-primary" @click="showDsModal = true">+ 添加数据源</button>
      </div>

      <div v-if="dsLoading" class="skeleton-list">
        <div v-for="i in 2" :key="i" class="skeleton-item"></div>
      </div>
      <div v-else class="ds-list">
        <div v-if="datasources.length === 0" class="empty-state">
          <div class="empty-icon">🗄️</div>
          <p>暂无数据源，支持阿里云 OSS、AWS S3、MySQL 等</p>
        </div>
        <div v-for="ds in datasources" :key="ds.id" class="ds-card">
          <div class="ds-card__icon">{{ dsTypeIcons[ds.type] || '📦' }}</div>
          <div class="ds-card__info">
            <div class="ds-card__name">{{ ds.name }}</div>
            <div class="ds-card__type">{{ dsTypeNames[ds.type] }}</div>
            <div class="ds-card__meta">
              <span :class="['ds-status', `ds-status--${ds.status}`]">{{ ds.status }}</span>
              <span v-if="ds.last_sync">最后同步: {{ formatDate(ds.last_sync) }}</span>
            </div>
          </div>
          <div class="ds-card__actions">
            <button class="btn-test" @click="testDs(ds.id)">测试</button>
            <button class="btn-sync" @click="syncDs(ds.id)">同步</button>
            <button class="btn-delete" @click="deleteDs(ds.id)">删除</button>
          </div>
        </div>
      </div>

      <!-- 添加数据源弹窗 -->
      <div v-if="showDsModal" class="modal-overlay" @click.self="showDsModal = false">
        <div class="modal-card modal-card--wide">
          <h3>添加数据源</h3>
          <div class="form-group">
            <label>数据源类型 *</label>
            <select v-model="newDs.type" class="form-select">
              <option v-for="t in dsTypes" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>名称 *</label>
            <input v-model="newDs.name" placeholder="数据源名称" class="form-input" />
          </div>

          <!-- OSS 配置 -->
          <template v-if="newDs.type === 'oss'">
            <div class="form-group"><label>Endpoint</label><input v-model="newDs.config.endpoint" placeholder="oss-cn-hangzhou.aliyuncs.com" class="form-input" /></div>
            <div class="form-group"><label>Bucket</label><input v-model="newDs.config.bucket" placeholder="my-bucket" class="form-input" /></div>
            <div class="form-group"><label>AccessKeyId</label><input v-model="newDs.config.access_key_id" class="form-input" /></div>
            <div class="form-group"><label>AccessKeySecret</label><input v-model="newDs.config.access_key_secret" type="password" class="form-input" /></div>
            <div class="form-group"><label>路径前缀（可选）</label><input v-model="newDs.config.prefix" placeholder="如：docs/" class="form-input" /></div>
          </template>

          <!-- S3 配置 -->
          <template v-else-if="newDs.type === 's3'">
            <div class="form-group"><label>Bucket</label><input v-model="newDs.config.bucket" class="form-input" /></div>
            <div class="form-group"><label>Access Key ID</label><input v-model="newDs.config.aws_access_key_id" class="form-input" /></div>
            <div class="form-group"><label>Secret Access Key</label><input v-model="newDs.config.aws_secret_access_key" type="password" class="form-input" /></div>
            <div class="form-group"><label>Region</label><input v-model="newDs.config.region_name" placeholder="us-east-1" class="form-input" /></div>
            <div class="form-group"><label>自定义 Endpoint（MinIO）</label><input v-model="newDs.config.endpoint_url" placeholder="http://localhost:9000" class="form-input" /></div>
          </template>

          <!-- MySQL 配置 -->
          <template v-else-if="newDs.type === 'mysql'">
            <div class="form-group"><label>Host</label><input v-model="newDs.config.host" placeholder="localhost" class="form-input" /></div>
            <div class="form-group"><label>Port</label><input v-model.number="newDs.config.port" type="number" placeholder="3306" class="form-input" /></div>
            <div class="form-group"><label>Database</label><input v-model="newDs.config.database" class="form-input" /></div>
            <div class="form-group"><label>Username</label><input v-model="newDs.config.username" class="form-input" /></div>
            <div class="form-group"><label>Password</label><input v-model="newDs.config.password" type="password" class="form-input" /></div>
            <div class="form-group"><label>SQL 查询（提取文本）</label><textarea v-model="newDs.config.query" class="form-textarea" placeholder="SELECT id, content FROM documents"></textarea></div>
            <div class="form-group"><label>文本列名</label><input v-model="newDs.config.text_column" placeholder="content" class="form-input" /></div>
          </template>

          <div class="modal-actions">
            <button class="btn-cancel" @click="showDsModal = false">取消</button>
            <button class="btn-confirm" @click="createDs">添加</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 审计日志 -->
    <div v-if="activeTab === 'audit'" class="tab-content">
      <div class="section-header">
        <h2>审计日志</h2>
        <p class="section-desc">记录所有用户操作行为，共 {{ auditStats.total_logs || 0 }} 条</p>
      </div>

      <!-- 统计卡片 -->
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-card__value">{{ auditStats.total_logs || 0 }}</div>
          <div class="stat-card__label">总记录数</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__value">{{ auditStats.today_logs || 0 }}</div>
          <div class="stat-card__label">今日操作</div>
        </div>
        <div class="stat-card" v-if="auditStats.top_actions?.[0]">
          <div class="stat-card__value">{{ auditStats.top_actions[0].action }}</div>
          <div class="stat-card__label">最频繁操作</div>
        </div>
      </div>

      <!-- 过滤器 -->
      <div class="filter-bar">
        <input v-model="auditFilter.user_email" placeholder="按邮箱过滤" class="filter-input" />
        <select v-model="auditFilter.action" class="filter-select">
          <option value="">全部操作</option>
          <option v-for="a in actionOptions" :key="a" :value="a">{{ a }}</option>
        </select>
        <button class="btn-search" @click="fetchAuditLogs">查询</button>
      </div>

      <!-- 日志表格 -->
      <div v-if="auditLoading" class="skeleton-list">
        <div v-for="i in 5" :key="i" class="skeleton-item skeleton-item--sm"></div>
      </div>
      <div v-else class="audit-table-wrapper">
        <table class="audit-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>用户</th>
              <th>操作</th>
              <th>资源</th>
              <th>状态</th>
              <th>IP</th>
              <th>耗时(ms)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="auditLogs.length === 0">
              <td colspan="7" class="empty-row">暂无日志</td>
            </tr>
            <tr v-for="log in auditLogs" :key="log.id" :class="{ 'row--error': log.status_code >= 400 }">
              <td>{{ formatDateTime(log.timestamp) }}</td>
              <td>{{ log.user_email || log.user_id || '-' }}</td>
              <td><span :class="['action-badge', `action--${log.action}`]">{{ log.action }}</span></td>
              <td>{{ [log.resource_type, log.resource_id].filter(Boolean).join(' / ') || log.request_path }}</td>
              <td>
                <span :class="['status-code', log.status_code >= 400 ? 'code--error' : 'code--ok']">
                  {{ log.status_code }}
                </span>
              </td>
              <td>{{ log.ip_address }}</td>
              <td>{{ log.duration_ms?.toFixed(1) }}</td>
            </tr>
          </tbody>
        </table>
        <!-- 分页 -->
        <div class="pagination">
          <button :disabled="auditPage <= 1" @click="auditPage--; fetchAuditLogs()">上一页</button>
          <span>第 {{ auditPage }} 页</span>
          <button @click="auditPage++; fetchAuditLogs()">下一页</button>
        </div>
      </div>
    </div>

    <!-- ── 办公联动 ────────────────────────────────────────────── -->
    <div v-if="activeTab === 'integrations'" class="tab-content">
      <div class="section-header">
        <h2>办公联动</h2>
        <p class="section-desc">将知识库与 Obsidian 笔记、飞书机器人无缝打通</p>
      </div>

      <!-- Obsidian 同步 -->
      <div class="integration-card">
        <div class="integration-card__header">
          <img src="https://obsidian.md/favicon.ico" class="integration-logo" alt="Obsidian" onerror="this.style.display='none'" />
          <div>
            <div class="integration-card__title">Obsidian Vault 同步</div>
            <div class="integration-card__desc">将本地 Vault 中的 .md 笔记增量同步到知识库，支持 [[wikilink]] 解析</div>
          </div>
          <span :class="['integration-status', obsidianStatus.configured ? 'status--ok' : 'status--off']">
            {{ obsidianStatus.configured ? `已同步 ${obsidianStatus.synced_files} 个文件` : '未配置' }}
          </span>
        </div>

        <div class="integration-form">
          <div class="form-row">
            <label>Vault 路径</label>
            <input v-model="obsidianForm.vault_path" class="form-input" placeholder="C:\Users\你\Documents\ObsidianVault" />
          </div>
          <div class="form-row">
            <label>目标知识库 ID（可选）</label>
            <input v-model="obsidianForm.kb_id" class="form-input" placeholder="留空则导入到默认目录" />
          </div>
          <div class="form-row">
            <label>排除模式（正则，逗号分隔）</label>
            <input v-model="obsidianExclude" class="form-input" placeholder="templates/,\.trash/" />
          </div>
          <div class="form-actions">
            <button class="btn-primary" @click="configObsidian" :disabled="obsidianLoading">配置 Vault</button>
            <button class="btn-secondary" @click="syncObsidian" :disabled="obsidianLoading || !obsidianStatus.configured">
              {{ obsidianLoading ? '同步中...' : '立即同步' }}
            </button>
          </div>
        </div>

        <div v-if="obsidianSyncResult" class="sync-result">
          <span class="sync-badge">+{{ obsidianSyncResult.added }}</span> 新增 ·
          <span class="sync-badge sync-badge--update">~{{ obsidianSyncResult.updated }}</span> 更新 ·
          <span class="sync-badge sync-badge--skip">{{ obsidianSyncResult.skipped }}</span> 跳过
        </div>
      </div>

      <!-- 飞书机器人 -->
      <div class="integration-card" style="margin-top: 16px;">
        <div class="integration-card__header">
          <img src="https://sf3-cn.feishucdn.com/obj/feishu-static/favicon.ico" class="integration-logo" alt="飞书" onerror="this.style.display='none'" />
          <div>
            <div class="integration-card__title">飞书机器人</div>
            <div class="integration-card__desc">在飞书群/私聊中 @ 机器人，自动触发知识库问答</div>
          </div>
          <span :class="['integration-status', feishuStatus.configured ? 'status--ok' : 'status--off']">
            {{ feishuStatus.configured ? '已配置' : '未配置' }}
          </span>
        </div>

        <div class="integration-form">
          <div class="form-row">
            <label>App ID</label>
            <input v-model="feishuForm.app_id" class="form-input" placeholder="cli_xxxxxxxxxxxxxxxx" />
          </div>
          <div class="form-row">
            <label>App Secret</label>
            <input v-model="feishuForm.app_secret" type="password" class="form-input" placeholder="••••••••••••••••••••••••••" />
          </div>
          <div class="form-row">
            <label>Verification Token（可选）</label>
            <input v-model="feishuForm.verification_token" class="form-input" />
          </div>
          <div class="form-row">
            <label>Encrypt Key（可选）</label>
            <input v-model="feishuForm.encrypt_key" class="form-input" />
          </div>
          <div class="form-row">
            <label>默认知识库 ID（可选）</label>
            <input v-model="feishuForm.default_kb_id" class="form-input" placeholder="留空则直接 LLM 回答" />
          </div>
          <div class="form-actions">
            <button class="btn-primary" @click="configFeishu" :disabled="feishuLoading">保存配置</button>
          </div>
        </div>

        <!-- Webhook URL 展示 -->
        <div class="webhook-box">
          <span class="webhook-label">Webhook 事件订阅地址：</span>
          <code class="webhook-url">{{ webhookUrl }}</code>
          <button class="btn-copy" @click="copyWebhook">复制</button>
        </div>

        <!-- 配置步骤 -->
        <details class="setup-guide">
          <summary>📋 飞书配置步骤</summary>
          <ol>
            <li>访问 <a href="https://open.feishu.cn/app" target="_blank">飞书开放平台</a> → 创建企业自建应用</li>
            <li>添加「机器人」能力，申请 <code>im:message</code>、<code>im:message:send_as_bot</code> 权限</li>
            <li>事件订阅 → 请求地址填写上方 Webhook 地址（需公网可访问，可用 ngrok 内网穿透）</li>
            <li>订阅事件：<code>im.message.receive_v1</code></li>
            <li>在上方填写 App ID、App Secret → 保存配置</li>
            <li>发布应用 → 邀请机器人加入群 → 群内 @ 机器人即可触发问答 ✅</li>
          </ol>
        </details>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive, computed } from 'vue'
import axios from 'axios'
import { MessagePlugin } from 'tdesign-vue-next'

const activeTab = ref('apikeys')
const tabs = [
  { id: 'apikeys', label: 'API Key 管理', icon: '🔑' },
  { id: 'datasources', label: '多数据源', icon: '🗄️' },
  { id: 'audit', label: '审计日志', icon: '📋' },
  { id: 'integrations', label: '办公联动', icon: '🔗' },
]

// ── API Key ────────────────────────────────────────────────────
const apiKeys = ref<any[]>([])
const keysLoading = ref(false)
const showCreateModal = ref(false)
const newCreatedKey = ref('')
const newKey = reactive({ name: '', description: '', expires_days: null as number | null, rate_limit: 1000 })

async function fetchKeys() {
  keysLoading.value = true
  try {
    const res = await axios.get('/api/apikeys/list')
    apiKeys.value = res.data.keys || []
  } finally { keysLoading.value = false }
}

async function createKey() {
  if (!newKey.name.trim()) { MessagePlugin.warning('请填写名称'); return }
  try {
    const res = await axios.post('/api/apikeys/create', newKey)
    newCreatedKey.value = res.data.api_key
    showCreateModal.value = false
    Object.assign(newKey, { name: '', description: '', expires_days: null, rate_limit: 1000 })
    await fetchKeys()
  } catch { MessagePlugin.error('创建失败') }
}

async function toggleKey(id: number) {
  try {
    await axios.patch(`/api/apikeys/${id}/toggle`)
    await fetchKeys()
  } catch { MessagePlugin.error('操作失败') }
}

async function deleteKey(id: number) {
  if (!confirm('确定删除此 API Key？')) return
  try {
    await axios.delete(`/api/apikeys/${id}`)
    await fetchKeys()
    MessagePlugin.success('已删除')
  } catch { MessagePlugin.error('删除失败') }
}

function copyKey() {
  navigator.clipboard.writeText(newCreatedKey.value).then(() => MessagePlugin.success('已复制'))
}

// ── 数据源 ─────────────────────────────────────────────────────
const datasources = ref<any[]>([])
const dsLoading = ref(false)
const showDsModal = ref(false)
const dsTypes = ref<any[]>([])
const newDs = reactive({ name: '', type: 'oss', config: {} as Record<string, any>, kb_id: null })

const dsTypeIcons: Record<string, string> = {
  oss: '☁️', s3: '🪣', mysql: '🐬', postgresql: '🐘', sqlite: '📁',
}
const dsTypeNames: Record<string, string> = {
  oss: '阿里云 OSS', s3: 'AWS S3 / MinIO', mysql: 'MySQL',
  postgresql: 'PostgreSQL', sqlite: 'SQLite',
}

async function fetchDatasources() {
  dsLoading.value = true
  try {
    const [dsRes, typesRes] = await Promise.all([
      axios.get('/api/datasources/list'),
      axios.get('/api/datasources/types'),
    ])
    datasources.value = dsRes.data.datasources || []
    dsTypes.value = typesRes.data.types?.filter((t: any) => t.status === 'supported') || []
  } finally { dsLoading.value = false }
}

async function createDs() {
  if (!newDs.name.trim()) { MessagePlugin.warning('请填写名称'); return }
  try {
    await axios.post('/api/datasources/create', { ...newDs })
    showDsModal.value = false
    Object.assign(newDs, { name: '', type: 'oss', config: {} })
    await fetchDatasources()
    MessagePlugin.success('数据源已添加')
  } catch { MessagePlugin.error('添加失败') }
}

async function testDs(id: number) {
  const result = await axios.post(`/api/datasources/${id}/test`).catch(() => null)
  if (result?.data?.status === 'ok') MessagePlugin.success(result.data.message)
  else MessagePlugin.error(result?.data?.message || '连通性测试失败')
}

async function syncDs(id: number) {
  const res = await axios.post(`/api/datasources/${id}/sync`).catch(() => null)
  if (res) MessagePlugin.info('同步任务已提交，后台执行中')
  else MessagePlugin.error('触发同步失败')
}

async function deleteDs(id: number) {
  if (!confirm('确定删除此数据源配置？')) return
  try { await axios.delete(`/api/datasources/${id}`); await fetchDatasources() } catch {}
}

// ── 审计日志 ───────────────────────────────────────────────────
const auditLogs = ref<any[]>([])
const auditStats = ref<any>({})
const auditLoading = ref(false)
const auditPage = ref(1)
const auditFilter = reactive({ user_email: '', action: '' })
const actionOptions = ['AUTH', 'QUERY', 'FILE_UPLOAD', 'CREATE', 'UPDATE', 'DELETE', 'READ']

async function fetchAuditLogs() {
  auditLoading.value = true
  try {
    const params: Record<string, any> = { page: auditPage.value, page_size: 50 }
    if (auditFilter.user_email) params.user_email = auditFilter.user_email
    if (auditFilter.action) params.action = auditFilter.action
    const [logsRes, statsRes] = await Promise.all([
      axios.get('/api/audit/logs', { params }),
      axios.get('/api/audit/stats'),
    ])
    auditLogs.value = logsRes.data.logs || []
    auditStats.value = statsRes.data
  } finally { auditLoading.value = false }
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('zh-CN')
}
function formatDateTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-')
}

onMounted(async () => {
  await Promise.all([fetchKeys(), fetchDatasources(), fetchAuditLogs(), fetchObsidianStatus(), fetchFeishuStatus()])
})

// ── 办公联动：Obsidian ────────────────────────────────────────
const obsidianStatus = ref<any>({ configured: false, synced_files: 0 })
const obsidianSyncResult = ref<any>(null)
const obsidianLoading = ref(false)
const obsidianExclude = ref('templates/,\\.trash/')
const obsidianForm = reactive({ vault_path: '', kb_id: '' })

async function fetchObsidianStatus() {
  try {
    const res = await axios.get('/api/integrations/obsidian/status')
    obsidianStatus.value = res.data
    if (res.data.vault_path) obsidianForm.vault_path = res.data.vault_path
    if (res.data.kb_id) obsidianForm.kb_id = res.data.kb_id
  } catch { /* 未配置时静默 */ }
}

async function configObsidian() {
  if (!obsidianForm.vault_path.trim()) { MessagePlugin.warning('请填写 Vault 路径'); return }
  obsidianLoading.value = true
  try {
    const excludeList = obsidianExclude.value.split(',').map(s => s.trim()).filter(Boolean)
    await axios.post('/api/integrations/obsidian/configure', {
      vault_path: obsidianForm.vault_path,
      kb_id: obsidianForm.kb_id || null,
      exclude_patterns: excludeList,
    })
    MessagePlugin.success('Vault 配置成功')
    await fetchObsidianStatus()
  } catch (e: any) {
    MessagePlugin.error(e.response?.data?.detail || '配置失败')
  } finally { obsidianLoading.value = false }
}

async function syncObsidian() {
  obsidianLoading.value = true
  obsidianSyncResult.value = null
  try {
    const res = await axios.post('/api/integrations/obsidian/sync')
    obsidianSyncResult.value = res.data.stats
    MessagePlugin.success(`同步完成：+${res.data.stats.added} 新增，~${res.data.stats.updated} 更新`)
    await fetchObsidianStatus()
  } catch (e: any) {
    MessagePlugin.error(e.response?.data?.detail || '同步失败')
  } finally { obsidianLoading.value = false }
}

// ── 办公联动：飞书 ────────────────────────────────────────────
const feishuStatus = ref<any>({ configured: false })
const feishuLoading = ref(false)
const feishuForm = reactive({
  app_id: '', app_secret: '', verification_token: '', encrypt_key: '', default_kb_id: ''
})
const webhookUrl = computed(() => `${window.location.protocol}//${window.location.hostname}:8000/api/integrations/feishu/webhook`)

async function fetchFeishuStatus() {
  try {
    const res = await axios.get('/api/integrations/feishu/status')
    feishuStatus.value = res.data
    if (res.data.default_kb_id) feishuForm.default_kb_id = res.data.default_kb_id
  } catch { /* 未配置时静默 */ }
}

async function configFeishu() {
  if (!feishuForm.app_id || !feishuForm.app_secret) {
    MessagePlugin.warning('请填写 App ID 和 App Secret')
    return
  }
  feishuLoading.value = true
  try {
    const params = new URLSearchParams(feishuForm as any)
    await axios.post(`/api/integrations/feishu/configure?${params.toString()}`)
    MessagePlugin.success('飞书配置已保存')
    await fetchFeishuStatus()
  } catch (e: any) {
    MessagePlugin.error(e.response?.data?.detail || '配置失败')
  } finally { feishuLoading.value = false }
}

async function copyWebhook() {
  await navigator.clipboard.writeText(webhookUrl.value)
  MessagePlugin.success('Webhook 地址已复制')
}
</script>

<style scoped>
.settings-page { height: 100vh; overflow: auto; background: #f9fafb; padding: 24px 32px; }

.settings-tabs {
  display: flex; gap: 4px; margin-bottom: 24px;
  background: white; border-radius: 10px; padding: 4px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06); width: fit-content;
}
.tab-btn {
  padding: 8px 18px; border-radius: 7px; border: none;
  background: transparent; cursor: pointer; font-size: 13.5px;
  color: #6b7280; font-weight: 500; transition: all 0.15s;
  display: flex; align-items: center; gap: 6px;
}
.tab-btn.active { background: #eff6ff; color: #4f7ef8; font-weight: 600; }
.tab-icon { font-size: 15px; }

.tab-content { max-width: 900px; }

.section-header {
  display: flex; flex-wrap: wrap; align-items: flex-start; gap: 12px;
  margin-bottom: 20px;
}
.section-header h2 { font-size: 18px; color: #111827; margin: 0; }
.section-desc { font-size: 13px; color: #9ca3af; margin: 0; width: 100%; }
.btn-primary {
  margin-left: auto; padding: 8px 16px; border-radius: 8px;
  background: #4f7ef8; color: white; border: none; cursor: pointer;
  font-size: 13px; font-weight: 500;
}
.btn-primary:hover { background: #3b6fd4; }

/* 骨架屏 */
.skeleton-list { display: flex; flex-direction: column; gap: 10px; }
.skeleton-item {
  height: 72px; background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%; border-radius: 10px;
  animation: shimmer 1.5s infinite;
}
.skeleton-item--sm { height: 44px; }
@keyframes shimmer { to { background-position: -200% 0; } }

/* API Key 卡片 */
.key-list { display: flex; flex-direction: column; gap: 10px; }
.key-card {
  display: flex; align-items: center; gap: 16px;
  background: white; border-radius: 10px; padding: 14px 18px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.key-card__info { flex: 1; min-width: 0; }
.key-card__name { font-weight: 600; font-size: 14px; color: #111827; }
.key-card__prefix { font-family: monospace; font-size: 13px; color: #6b7280; margin: 2px 0; }
.key-card__meta { font-size: 12px; color: #9ca3af; display: flex; gap: 8px; flex-wrap: wrap; }
.key-card__actions { display: flex; align-items: center; gap: 8px; }
.status-badge { padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
.badge--active { background: #dcfce7; color: #166534; }
.badge--inactive { background: #fee2e2; color: #991b1b; }

/* 数据源卡片 */
.ds-list { display: flex; flex-direction: column; gap: 10px; }
.ds-card {
  display: flex; align-items: center; gap: 14px;
  background: white; border-radius: 10px; padding: 14px 18px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.ds-card__icon { font-size: 28px; }
.ds-card__info { flex: 1; min-width: 0; }
.ds-card__name { font-weight: 600; font-size: 14px; color: #111827; }
.ds-card__type { font-size: 12px; color: #9ca3af; }
.ds-card__meta { display: flex; gap: 10px; align-items: center; margin-top: 4px; font-size: 12px; }
.ds-status { padding: 2px 7px; border-radius: 10px; font-size: 11px; font-weight: 600; }
.ds-status--idle { background: #f3f4f6; color: #6b7280; }
.ds-status--syncing { background: #dbeafe; color: #1d4ed8; }
.ds-card__actions { display: flex; gap: 8px; }

/* 审计日志 */
.stats-row { display: flex; gap: 14px; margin-bottom: 18px; flex-wrap: wrap; }
.stat-card {
  background: white; border-radius: 10px; padding: 16px 20px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06); min-width: 120px;
}
.stat-card__value { font-size: 22px; font-weight: 700; color: #4f7ef8; }
.stat-card__label { font-size: 12px; color: #9ca3af; margin-top: 2px; }

.filter-bar { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.filter-input, .filter-select {
  padding: 7px 12px; border: 1px solid #e5e7eb; border-radius: 7px;
  font-size: 13px; outline: none;
}
.filter-input:focus, .filter-select:focus { border-color: #4f7ef8; }
.btn-search {
  padding: 7px 16px; background: #4f7ef8; color: white;
  border: none; border-radius: 7px; cursor: pointer; font-size: 13px;
}

.audit-table-wrapper { background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.audit-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.audit-table th { background: #f9fafb; padding: 10px 12px; text-align: left; font-weight: 600; color: #6b7280; border-bottom: 1px solid #f0f0f0; }
.audit-table td { padding: 9px 12px; border-bottom: 1px solid #f9fafb; color: #374151; }
.audit-table tr:last-child td { border-bottom: none; }
.row--error { background: #fff5f5; }
.empty-row { text-align: center; color: #9ca3af; padding: 24px; }

.action-badge { padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 600; background: #f3f4f6; }
.action--AUTH { background: #dbeafe; color: #1d4ed8; }
.action--QUERY { background: #dcfce7; color: #166534; }
.action--FILE_UPLOAD { background: #fef9c3; color: #854d0e; }
.action--DELETE { background: #fee2e2; color: #991b1b; }
.action--CREATE { background: #f3e8ff; color: #7e22ce; }

.status-code { font-family: monospace; font-weight: 700; }
.code--ok { color: #16a34a; }
.code--error { color: #dc2626; }

.pagination { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-top: 1px solid #f0f0f0; font-size: 13px; }
.pagination button { padding: 5px 12px; border: 1px solid #e5e7eb; border-radius: 6px; cursor: pointer; background: white; }
.pagination button:disabled { opacity: 0.4; cursor: not-allowed; }

/* 弹窗 */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 9999; display: flex; align-items: center; justify-content: center; }
.modal-card {
  background: white; border-radius: 14px; padding: 24px;
  width: 420px; max-height: 90vh; overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0,0,0,0.15);
}
.modal-card--wide { width: 520px; }
.modal-card h3 { margin: 0 0 18px; font-size: 16px; }
.form-group { margin-bottom: 14px; }
.form-group label { display: block; font-size: 12px; color: #6b7280; margin-bottom: 5px; font-weight: 500; }
.form-input {
  width: 100%; padding: 8px 10px; border: 1px solid #d1d5db;
  border-radius: 7px; font-size: 13px; outline: none; box-sizing: border-box;
}
.form-input:focus { border-color: #4f7ef8; }
.form-select {
  width: 100%; padding: 8px 10px; border: 1px solid #d1d5db;
  border-radius: 7px; font-size: 13px; outline: none;
}
.form-textarea {
  width: 100%; padding: 8px 10px; border: 1px solid #d1d5db;
  border-radius: 7px; font-size: 13px; outline: none; min-height: 80px; box-sizing: border-box;
}
.modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; }
.btn-cancel { padding: 8px 16px; border: 1px solid #d1d5db; border-radius: 7px; background: white; cursor: pointer; font-size: 13px; }
.btn-confirm { padding: 8px 16px; border: none; border-radius: 7px; background: #4f7ef8; color: white; cursor: pointer; font-size: 13px; }

/* Key 展示 */
.key-reveal-box {
  background: #ecfdf5; border: 1px solid #6ee7b7; border-radius: 10px;
  padding: 20px; margin-top: 16px;
}
.key-reveal-box h4 { margin: 0 0 8px; color: #065f46; }
.key-reveal-box p { font-size: 13px; color: #065f46; margin: 0 0 10px; }
.key-reveal-value {
  display: flex; align-items: center; gap: 10px;
  font-family: monospace; font-size: 13px; background: white;
  border: 1px solid #a7f3d0; border-radius: 7px; padding: 10px 14px;
  word-break: break-all;
}
.copy-btn {
  flex-shrink: 0; padding: 4px 10px; background: #10b981; color: white;
  border: none; border-radius: 5px; cursor: pointer; font-size: 12px;
}
.btn-close-reveal {
  margin-top: 10px; padding: 6px 14px; background: transparent;
  border: 1px solid #6ee7b7; border-radius: 7px; cursor: pointer;
  font-size: 12px; color: #065f46;
}

/* 通用按钮 */
.btn-toggle, .btn-delete, .btn-test, .btn-sync {
  padding: 5px 12px; border-radius: 6px; border: 1px solid;
  font-size: 12px; cursor: pointer;
}
.btn-toggle { border-color: #d1d5db; background: white; color: #374151; }
.btn-delete { border-color: #fecaca; background: #fff5f5; color: #dc2626; }
.btn-test { border-color: #bfdbfe; background: #eff6ff; color: #2563eb; }
.btn-sync { border-color: #a7f3d0; background: #ecfdf5; color: #065f46; }

/* 空状态 */
.empty-state { text-align: center; padding: 40px; color: #9ca3af; }
.empty-icon { font-size: 36px; margin-bottom: 10px; }

/* 办公联动 */
.integration-card {
  background: white; border-radius: 12px; padding: 20px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.integration-card__header {
  display: flex; align-items: flex-start; gap: 14px; margin-bottom: 18px;
}
.integration-logo { width: 32px; height: 32px; object-fit: contain; border-radius: 6px; }
.integration-card__title { font-weight: 600; font-size: 15px; color: #111827; }
.integration-card__desc { font-size: 13px; color: #6b7280; margin-top: 3px; }
.integration-status {
  margin-left: auto; padding: 3px 10px; border-radius: 20px; font-size: 12px; white-space: nowrap; flex-shrink: 0;
}
.status--ok { background: #dcfce7; color: #15803d; }
.status--off { background: #f3f4f6; color: #9ca3af; }

.integration-form { border-top: 1px solid #f3f4f6; padding-top: 16px; }
.form-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.form-row label { width: 180px; flex-shrink: 0; font-size: 13px; color: #374151; font-weight: 500; }
.form-actions { display: flex; gap: 10px; margin-top: 14px; }
.btn-primary {
  padding: 8px 18px; border: none; border-radius: 7px;
  background: #4f7ef8; color: white; cursor: pointer; font-size: 13px; font-weight: 500;
  transition: background 0.15s;
}
.btn-primary:hover { background: #3b6ff5; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary {
  padding: 8px 18px; border: 1px solid #d1d5db; border-radius: 7px;
  background: white; color: #374151; cursor: pointer; font-size: 13px;
}
.btn-secondary:disabled { opacity: 0.4; cursor: not-allowed; }

.sync-result {
  margin-top: 12px; font-size: 13px; color: #6b7280; padding-top: 12px; border-top: 1px solid #f3f4f6;
}
.sync-badge {
  display: inline-block; padding: 1px 7px; border-radius: 4px;
  font-weight: 600; background: #dcfce7; color: #15803d;
}
.sync-badge--update { background: #dbeafe; color: #1d4ed8; }
.sync-badge--skip { background: #f3f4f6; color: #9ca3af; }

.webhook-box {
  margin-top: 16px; padding: 12px 14px; background: #f8fafc; border-radius: 8px;
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}
.webhook-label { font-size: 13px; color: #6b7280; white-space: nowrap; }
.webhook-url {
  flex: 1; font-size: 12px; font-family: monospace; color: #1e40af;
  background: white; border: 1px solid #e2e8f0; border-radius: 5px;
  padding: 4px 8px; word-break: break-all;
}
.btn-copy {
  padding: 4px 12px; border: none; border-radius: 5px;
  background: #3b82f6; color: white; cursor: pointer; font-size: 12px; white-space: nowrap;
}

.setup-guide {
  margin-top: 16px; font-size: 13px; color: #374151; border-top: 1px solid #f3f4f6; padding-top: 14px;
}
.setup-guide summary { cursor: pointer; font-weight: 500; color: #4f7ef8; padding: 2px 0; }
.setup-guide ol { padding-left: 18px; margin-top: 10px; line-height: 2; }
.setup-guide code {
  background: #f1f5f9; padding: 1px 5px; border-radius: 4px;
  font-family: monospace; font-size: 12px; color: #1e40af;
}
.setup-guide a { color: #4f7ef8; text-decoration: none; }
.setup-guide a:hover { text-decoration: underline; }
</style>
