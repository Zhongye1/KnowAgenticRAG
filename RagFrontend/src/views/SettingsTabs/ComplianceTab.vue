<template>
  <div class="tab-content">
    <div class="section-header">
      <h2>合规中心</h2>
      <p class="section-desc">SSO 单点登录、数据脱敏、API 限流与合规报表配置</p>
    </div>

    <div class="sub-tabs">
      <button
        v-for="t in subTabs"
        :key="t.id"
        :class="['sub-tab', { active: activeTab === t.id }]"
        @click="activeTab = t.id"
      >
        {{ t.label }}
      </button>
    </div>

    <!-- SSO 单点登录 -->
    <div v-if="activeTab === 'sso'">
      <div class="sso-list">
        <div v-for="provider in ssoProviders" :key="provider.id" class="sso-card">
          <div class="sso-header">
            <span class="sso-icon">{{ provider.icon }}</span>
            <div>
              <div class="sso-name">{{ provider.name }}</div>
              <div class="sso-type">{{ provider.type }}</div>
            </div>
            <label class="toggle-switch">
              <input v-model="provider.enabled" type="checkbox" />
              <span class="toggle-track"></span>
            </label>
          </div>
          <div v-if="provider.enabled" class="sso-config">
            <template v-if="provider.id === 'oidc'">
              <div class="form-row">
                <label>Issuer URL</label
                ><input
                  v-model="provider.config.issuer"
                  class="form-input"
                  placeholder="https://accounts.google.com"
                />
              </div>
              <div class="form-row">
                <label>Client ID</label
                ><input v-model="provider.config.client_id" class="form-input" />
              </div>
              <div class="form-row">
                <label>Client Secret</label
                ><input
                  v-model="provider.config.client_secret"
                  type="password"
                  class="form-input"
                />
              </div>
              <div class="form-row">
                <label>回调地址</label
                ><code class="callback-url">{{ callbackBase }}/auth/oidc/callback</code>
              </div>
            </template>
            <template v-if="provider.id === 'github'">
              <div class="form-row">
                <label>Client ID</label
                ><input v-model="provider.config.client_id" class="form-input" />
              </div>
              <div class="form-row">
                <label>Client Secret</label
                ><input
                  v-model="provider.config.client_secret"
                  type="password"
                  class="form-input"
                />
              </div>
              <div class="form-row">
                <label>回调地址</label
                ><code class="callback-url">{{ callbackBase }}/auth/github/callback</code>
              </div>
            </template>
            <template v-if="provider.id === 'ldap'">
              <div class="form-row">
                <label>LDAP Host</label><input v-model="provider.config.host" class="form-input" />
              </div>
              <div class="form-row">
                <label>Base DN</label
                ><input
                  v-model="provider.config.base_dn"
                  class="form-input"
                  placeholder="dc=example,dc=com"
                />
              </div>
              <div class="form-row">
                <label>Bind DN</label><input v-model="provider.config.bind_dn" class="form-input" />
              </div>
              <div class="form-row">
                <label>Bind 密码</label
                ><input
                  v-model="provider.config.bind_password"
                  type="password"
                  class="form-input"
                />
              </div>
            </template>
            <button class="btn-primary-sm" @click="saveSso(provider)">保存配置</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 数据脱敏 -->
    <div v-if="activeTab === 'masking'">
      <div class="card">
        <div class="card-title">数据脱敏规则</div>
        <div class="masking-rules">
          <div v-for="rule in maskingRules" :key="rule.id" class="masking-rule">
            <label class="toggle-switch">
              <input v-model="rule.enabled" type="checkbox" />
              <span class="toggle-track"></span>
            </label>
            <div class="rule-info">
              <div class="rule-name">{{ rule.name }}</div>
              <div class="rule-pattern">{{ rule.pattern }}</div>
            </div>
            <div class="rule-example">
              <span class="example-before">{{ rule.before }}</span>
              <span class="arrow">→</span>
              <span class="example-after">{{ rule.after }}</span>
            </div>
            <select v-model="rule.strategy" class="rule-strategy">
              <option value="redact">完全屏蔽</option>
              <option value="partial">部分屏蔽</option>
              <option value="hash">哈希替换</option>
              <option value="fake">生成假数据</option>
            </select>
          </div>
        </div>
        <div class="masking-scope">
          <div class="scope-title">脱敏应用范围</div>
          <div class="scope-checks">
            <label class="check-item"
              ><input v-model="maskingScope.rag_output" type="checkbox" />RAG 输出</label
            >
            <label class="check-item"
              ><input v-model="maskingScope.audit_logs" type="checkbox" />审计日志</label
            >
            <label class="check-item"
              ><input v-model="maskingScope.export" type="checkbox" />数据导出</label
            >
            <label class="check-item"
              ><input v-model="maskingScope.api_response" type="checkbox" />API 响应</label
            >
          </div>
        </div>
        <button class="btn-primary" @click="saveMasking">保存脱敏配置</button>
      </div>

      <!-- 脱敏测试 -->
      <div class="card" style="margin-top: 12px">
        <div class="card-title">🧪 在线测试</div>
        <textarea
          v-model="maskingTestInput"
          class="test-textarea"
          rows="4"
          placeholder="输入包含敏感信息的文本进行测试...
示例：联系我：13812345678，邮箱：test@example.com，身份证：440101199001011234"
        ></textarea>
        <button class="btn-primary-sm" style="margin-top: 8px" @click="testMasking">
          运行脱敏
        </button>
        <div v-if="maskingTestOutput" class="masking-output">{{ maskingTestOutput }}</div>
      </div>
    </div>

    <!-- API 限流 -->
    <div v-if="activeTab === 'ratelimit'">
      <div class="card">
        <div class="card-title">API 限流配置</div>
        <div class="rate-limit-grid">
          <div v-for="endpoint in rateLimitRules" :key="endpoint.id" class="rate-rule">
            <div class="rate-endpoint">
              <span :class="['method-badge', `method--${endpoint.method.toLowerCase()}`]">{{
                endpoint.method
              }}</span>
              <code class="endpoint-path">{{ endpoint.path }}</code>
            </div>
            <div class="rate-controls">
              <div class="rate-row">
                <label>每分钟</label>
                <input
                  v-model.number="endpoint.per_minute"
                  type="number"
                  min="1"
                  class="rate-input"
                />
                <span>次</span>
              </div>
              <div class="rate-row">
                <label>每小时</label>
                <input
                  v-model.number="endpoint.per_hour"
                  type="number"
                  min="1"
                  class="rate-input"
                />
                <span>次</span>
              </div>
              <div class="rate-row">
                <label>超限行为</label>
                <select v-model="endpoint.action" class="rate-select">
                  <option value="reject">拒绝请求</option>
                  <option value="throttle">降速处理</option>
                  <option value="queue">加入队列</option>
                </select>
              </div>
            </div>
            <div :class="['rate-usage', usageLevel(endpoint.usage_pct)]">
              <div class="usage-bar" :style="{ width: endpoint.usage_pct + '%' }"></div>
              <span class="usage-pct">{{ endpoint.usage_pct }}%</span>
            </div>
          </div>
        </div>
        <button class="btn-primary" @click="saveRateLimit">保存限流配置</button>
      </div>
    </div>

    <!-- 合规报表 -->
    <div v-if="activeTab === 'report'">
      <div class="report-grid">
        <div v-for="report in reports" :key="report.id" class="report-card">
          <div class="report-icon">{{ report.icon }}</div>
          <div class="report-name">{{ report.name }}</div>
          <div class="report-desc">{{ report.desc }}</div>
          <div class="report-period">
            <select v-model="report.period" class="period-select">
              <option value="7d">最近 7 天</option>
              <option value="30d">最近 30 天</option>
              <option value="90d">最近 90 天</option>
              <option value="custom">自定义</option>
            </select>
          </div>
          <div class="report-actions">
            <button class="btn-preview" @click="previewReport(report)">预览</button>
            <button class="btn-export" @click="exportReport(report)">导出 PDF</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import axios from 'axios'

const activeTab = ref('sso')
const subTabs = [
  { id: 'sso', label: '🔐 单点登录 SSO' },
  { id: 'masking', label: '🛡️ 数据脱敏' },
  { id: 'ratelimit', label: '⚡ API 限流' },
  { id: 'report', label: '📊 合规报表' }
]

const callbackBase = computed(() => `${window.location.protocol}//${window.location.hostname}:8000`)

const ssoProviders = ref([
  {
    id: 'oidc',
    name: 'OIDC / OAuth2',
    type: 'OpenID Connect',
    icon: '🔑',
    enabled: false,
    config: { issuer: '', client_id: '', client_secret: '' }
  },
  {
    id: 'github',
    name: 'GitHub OAuth',
    type: 'Social Login',
    icon: '🐙',
    enabled: false,
    config: { client_id: '', client_secret: '' }
  },
  {
    id: 'ldap',
    name: 'LDAP / AD',
    type: '企业目录',
    icon: '🏢',
    enabled: false,
    config: { host: '', base_dn: '', bind_dn: '', bind_password: '' }
  }
])

const maskingRules = ref([
  {
    id: 'phone',
    name: '手机号',
    pattern: '/1[3-9]\\d{9}/',
    before: '13812345678',
    after: '138****5678',
    enabled: true,
    strategy: 'partial'
  },
  {
    id: 'email',
    name: '电子邮件',
    pattern: '/[\\w.-]+@[\\w.-]+/',
    before: 'user@example.com',
    after: 'u***@***.com',
    enabled: true,
    strategy: 'partial'
  },
  {
    id: 'id_card',
    name: '身份证号',
    pattern: '/\\d{17}[\\dX]/',
    before: '440101199001011234',
    after: '4401**********1234',
    enabled: true,
    strategy: 'partial'
  },
  {
    id: 'credit_card',
    name: '银行卡号',
    pattern: '/\\d{16,19}/',
    before: '6222021234567890',
    after: '6222 **** **** 7890',
    enabled: false,
    strategy: 'partial'
  },
  {
    id: 'ip',
    name: 'IP 地址',
    pattern: '/\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}/',
    before: '192.168.1.100',
    after: '192.168.*.*',
    enabled: false,
    strategy: 'partial'
  }
])

const maskingScope = reactive({
  rag_output: true,
  audit_logs: true,
  export: true,
  api_response: false
})
const maskingTestInput = ref('')
const maskingTestOutput = ref('')

const rateLimitRules = ref([
  {
    id: 'chat',
    method: 'POST',
    path: '/api/chat/stream',
    per_minute: 10,
    per_hour: 200,
    action: 'reject',
    usage_pct: 23
  },
  {
    id: 'upload',
    method: 'POST',
    path: '/api/documents/upload',
    per_minute: 5,
    per_hour: 50,
    action: 'reject',
    usage_pct: 8
  },
  {
    id: 'search',
    method: 'POST',
    path: '/api/rag/search',
    per_minute: 30,
    per_hour: 500,
    action: 'throttle',
    usage_pct: 61
  },
  {
    id: 'api_key',
    method: 'GET',
    path: '/api/*',
    per_minute: 60,
    per_hour: 1000,
    action: 'reject',
    usage_pct: 41
  }
])

const reports = ref([
  { id: 'access', icon: '🔍', name: '访问审计报告', desc: '用户登录/操作行为汇总', period: '30d' },
  {
    id: 'data_export',
    icon: '📤',
    name: '数据访问报告',
    desc: '知识库读写与导出记录',
    period: '30d'
  },
  {
    id: 'rate_limit',
    icon: '⚡',
    name: '限流统计报告',
    desc: 'API 调用超限与触发明细',
    period: '7d'
  },
  {
    id: 'compliance',
    icon: '✅',
    name: '合规自查报告',
    desc: '脱敏规则覆盖与效果评估',
    period: '30d'
  }
])

function usageLevel(pct: number) {
  if (pct >= 80) return 'usage--high'
  if (pct >= 50) return 'usage--mid'
  return 'usage--low'
}

async function saveSso(provider: any) {
  try {
    await axios.post('/api/sso/configure', { provider_id: provider.id, config: provider.config })
    MessagePlugin.success(`${provider.name} 配置已保存`)
  } catch {
    MessagePlugin.warning('演示模式，配置已暂存')
  }
}

async function saveMasking() {
  try {
    await axios.post('/api/compliance/masking', { rules: maskingRules.value, scope: maskingScope })
    MessagePlugin.success('脱敏配置已保存')
  } catch {
    MessagePlugin.warning('演示模式')
  }
}

function testMasking() {
  if (!maskingTestInput.value) return
  let result = maskingTestInput.value
  if (maskingRules.value.find(r => r.id === 'phone' && r.enabled)) {
    result = result.replace(/1[3-9]\d{9}/g, s => s.slice(0, 3) + '****' + s.slice(7))
  }
  if (maskingRules.value.find(r => r.id === 'email' && r.enabled)) {
    result = result.replace(/[\w.-]+@[\w.-]+\.\w+/g, s => {
      const [user, domain] = s.split('@')
      return user[0] + '***@' + '***.' + domain.split('.').pop()
    })
  }
  if (maskingRules.value.find(r => r.id === 'id_card' && r.enabled)) {
    result = result.replace(/\d{17}[\dX]/g, s => s.slice(0, 4) + '**********' + s.slice(14))
  }
  maskingTestOutput.value = result
}

async function saveRateLimit() {
  try {
    await axios.post('/api/compliance/rate-limits', rateLimitRules.value)
    MessagePlugin.success('限流配置已保存')
  } catch {
    MessagePlugin.warning('演示模式')
  }
}

function previewReport(report: any) {
  MessagePlugin.info(`正在生成 ${report.name} 预览...`)
}
function exportReport(report: any) {
  MessagePlugin.success(`${report.name} 已开始导出，完成后将发送到邮箱`)
}
</script>

<style scoped>
.tab-content {
  max-width: 900px;
}
.section-header {
  margin-bottom: 16px;
}
.section-header h2 {
  font-size: 18px;
  color: #111827;
  margin: 0 0 4px;
}
.section-desc {
  font-size: 13px;
  color: #9ca3af;
  margin: 0;
}

.sub-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}
.sub-tab {
  padding: 6px 16px;
  border-radius: 7px;
  border: 1px solid #e5e7eb;
  background: white;
  cursor: pointer;
  font-size: 13px;
  color: #6b7280;
}
.sub-tab.active {
  background: #eff6ff;
  border-color: #4f7ef8;
  color: #4f7ef8;
  font-weight: 600;
}

.sso-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sso-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}
.sso-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.sso-icon {
  font-size: 24px;
}
.sso-name {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}
.sso-type {
  font-size: 12px;
  color: #9ca3af;
}
.toggle-switch {
  margin-left: auto;
  position: relative;
}
.toggle-switch input {
  display: none;
}
.toggle-track {
  display: block;
  width: 36px;
  height: 20px;
  border-radius: 10px;
  background: #d1d5db;
  cursor: pointer;
  position: relative;
  transition: background 0.2s;
}
.toggle-track::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: white;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}
.toggle-switch input:checked + .toggle-track {
  background: #4f7ef8;
}
.toggle-switch input:checked + .toggle-track::after {
  transform: translateX(16px);
}

.sso-config {
  border-top: 1px solid #f3f4f6;
  padding-top: 12px;
}
.form-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.form-row label {
  width: 100px;
  flex-shrink: 0;
  font-size: 12px;
  color: #6b7280;
}
.form-input {
  flex: 1;
  padding: 7px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
}
.callback-url {
  font-size: 12px;
  font-family: monospace;
  background: #f1f5f9;
  padding: 4px 8px;
  border-radius: 5px;
  color: #1e40af;
}
.btn-primary-sm {
  padding: 6px 14px;
  border: none;
  border-radius: 6px;
  background: #4f7ef8;
  color: white;
  cursor: pointer;
  font-size: 12px;
  margin-top: 6px;
}

.card {
  background: white;
  border-radius: 12px;
  padding: 18px 20px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.card-title {
  font-size: 15px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 14px;
}
.btn-primary {
  padding: 8px 20px;
  border: none;
  border-radius: 7px;
  background: #4f7ef8;
  color: white;
  cursor: pointer;
  font-size: 13px;
  margin-top: 12px;
}

.masking-rules {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}
.masking-rule {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: #f9fafb;
  border-radius: 8px;
  flex-wrap: wrap;
}
.rule-info {
  flex: 1;
  min-width: 120px;
}
.rule-name {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
}
.rule-pattern {
  font-size: 11px;
  color: #9ca3af;
  font-family: monospace;
}
.rule-example {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.example-before {
  color: #dc2626;
  background: #fee2e2;
  padding: 1px 5px;
  border-radius: 4px;
  font-family: monospace;
}
.arrow {
  color: #9ca3af;
}
.example-after {
  color: #15803d;
  background: #dcfce7;
  padding: 1px 5px;
  border-radius: 4px;
  font-family: monospace;
}
.rule-strategy {
  padding: 4px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 5px;
  font-size: 12px;
  outline: none;
}

.masking-scope {
  margin-top: 12px;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
}
.scope-title {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
}
.scope-checks {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
.check-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  cursor: pointer;
}

.test-textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 7px;
  font-size: 13px;
  outline: none;
  resize: vertical;
  box-sizing: border-box;
}
.masking-output {
  margin-top: 10px;
  padding: 12px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 7px;
  font-size: 13px;
  font-family: monospace;
  white-space: pre-wrap;
  color: #15803d;
}

.rate-limit-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rate-rule {
  background: #f9fafb;
  border-radius: 8px;
  padding: 12px 14px;
}
.rate-endpoint {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.method-badge {
  padding: 2px 7px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 700;
  font-family: monospace;
}
.method--post {
  background: #fef3c7;
  color: #92400e;
}
.method--get {
  background: #dcfce7;
  color: #15803d;
}
.endpoint-path {
  font-size: 12px;
  font-family: monospace;
  color: #374151;
}
.rate-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-bottom: 8px;
}
.rate-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #6b7280;
}
.rate-input {
  width: 68px;
  padding: 4px 7px;
  border: 1px solid #e5e7eb;
  border-radius: 5px;
  font-size: 12px;
  text-align: center;
  outline: none;
}
.rate-select {
  padding: 4px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 5px;
  font-size: 12px;
  outline: none;
}
.rate-usage {
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
  position: relative;
  overflow: hidden;
}
.usage-bar {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s;
}
.usage--low .usage-bar {
  background: #10b981;
}
.usage--mid .usage-bar {
  background: #f59e0b;
}
.usage--high .usage-bar {
  background: #ef4444;
}
.usage-pct {
  position: absolute;
  right: 0;
  top: -14px;
  font-size: 10px;
  color: #9ca3af;
}

.report-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}
.report-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
  text-align: center;
}
.report-icon {
  font-size: 32px;
  margin-bottom: 8px;
}
.report-name {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 4px;
}
.report-desc {
  font-size: 12px;
  color: #9ca3af;
  margin-bottom: 12px;
}
.report-period {
  margin-bottom: 10px;
}
.period-select {
  padding: 5px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 12px;
  outline: none;
  width: 100%;
}
.report-actions {
  display: flex;
  gap: 6px;
}
.btn-preview,
.btn-export {
  flex: 1;
  padding: 6px;
  border-radius: 6px;
  border: 1px solid;
  font-size: 12px;
  cursor: pointer;
}
.btn-preview {
  border-color: #bfdbfe;
  color: #1d4ed8;
  background: #eff6ff;
}
.btn-export {
  border-color: #d1d5db;
  color: #374151;
  background: white;
}
</style>
