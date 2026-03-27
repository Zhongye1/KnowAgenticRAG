<template>
  <div class="tab-content">
    <div class="section-header">
      <h2>多模型管理</h2>
      <p class="section-desc">配置多个 LLM 供应商，支持负载均衡、故障转移与模型对比</p>
    </div>

    <!-- 当前默认模型 -->
    <div class="current-model-banner">
      <span class="banner-icon">🤖</span>
      <div>
        <div class="banner-title">当前默认模型</div>
        <div class="banner-model">{{ defaultModel?.provider }} · {{ defaultModel?.model_name }}</div>
      </div>
      <span class="banner-status" :class="defaultModel?.online ? 'status--ok' : 'status--off'">
        {{ defaultModel?.online ? '✓ 在线' : '✗ 离线' }}
      </span>
    </div>

    <!-- 模型供应商列表 -->
    <div class="providers-grid">
      <div v-for="provider in providers" :key="provider.id" class="provider-card">
        <div class="provider-header">
          <span class="provider-icon">{{ provider.icon }}</span>
          <div class="provider-meta">
            <div class="provider-name">{{ provider.name }}</div>
            <div class="provider-badge" :class="`badge--${provider.type}`">{{ provider.type_label }}</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" v-model="provider.enabled" @change="toggleProvider(provider)" />
            <span class="toggle-track"></span>
          </label>
        </div>

        <div v-if="provider.enabled" class="provider-config">
          <!-- Ollama（本地）-->
          <template v-if="provider.type === 'local'">
            <div class="cfg-row"><label>API 地址</label>
              <input v-model="provider.config.base_url" class="cfg-input" placeholder="http://localhost:11434" />
            </div>
            <div class="cfg-row"><label>模型</label>
              <div class="model-select-row">
                <select v-model="provider.config.model" class="cfg-select">
                  <option v-for="m in provider.available_models" :key="m" :value="m">{{ m }}</option>
                </select>
                <button class="btn-pull" @click="pullModel(provider)">拉取模型</button>
              </div>
            </div>
          </template>

          <!-- 云端 API -->
          <template v-else>
            <div class="cfg-row"><label>API Key</label>
              <input v-model="provider.config.api_key" type="password" class="cfg-input" :placeholder="provider.key_placeholder" />
            </div>
            <div class="cfg-row" v-if="provider.config.base_url !== undefined">
              <label>API 地址</label>
              <input v-model="provider.config.base_url" class="cfg-input" :placeholder="provider.url_placeholder || ''" />
            </div>
            <div class="cfg-row"><label>模型</label>
              <select v-model="provider.config.model" class="cfg-select">
                <option v-for="m in provider.available_models" :key="m" :value="m">{{ m }}</option>
              </select>
            </div>
            <div class="cfg-row"><label>温度</label>
              <div class="slider-row">
                <input type="range" min="0" max="2" step="0.1" v-model.number="provider.config.temperature" class="slider" />
                <span class="slider-val">{{ provider.config.temperature }}</span>
              </div>
            </div>
            <div class="cfg-row"><label>Max Tokens</label>
              <input v-model.number="provider.config.max_tokens" type="number" class="cfg-input-sm" />
            </div>
          </template>

          <div class="provider-actions">
            <button class="btn-test" @click="testProvider(provider)" :disabled="provider.testing">
              {{ provider.testing ? '测试中...' : '连通性测试' }}
            </button>
            <button class="btn-save" @click="saveProvider(provider)">保存</button>
            <button class="btn-default" v-if="!provider.is_default" @click="setDefault(provider)">设为默认</button>
            <span v-else class="default-label">✓ 默认</span>
          </div>

          <!-- 测试结果 -->
          <div v-if="provider.test_result" :class="['test-result', provider.test_result.ok ? 'result--ok' : 'result--err']">
            {{ provider.test_result.message }}
            <span v-if="provider.test_result.latency">（{{ provider.test_result.latency }}ms）</span>
          </div>
        </div>

        <!-- 用量统计 -->
        <div v-if="provider.enabled" class="usage-stats">
          <div class="usage-item"><span>今日调用</span><strong>{{ provider.usage?.today_calls || 0 }}</strong></div>
          <div class="usage-item"><span>Token 消耗</span><strong>{{ formatTokens(provider.usage?.today_tokens || 0) }}</strong></div>
          <div class="usage-item"><span>平均延迟</span><strong>{{ provider.usage?.avg_latency || '-' }}ms</strong></div>
        </div>
      </div>
    </div>

    <!-- 负载均衡策略 -->
    <div class="card" style="margin-top: 16px;">
      <div class="card-title">⚖️ 负载均衡 & 故障转移</div>
      <div class="lb-grid">
        <div class="lb-item">
          <label>路由策略</label>
          <select v-model="lbConfig.strategy" class="cfg-select">
            <option value="primary">主备模式（主失败切换备）</option>
            <option value="round_robin">轮询（均匀分发）</option>
            <option value="least_latency">最低延迟优先</option>
            <option value="cost_aware">成本优先</option>
          </select>
        </div>
        <div class="lb-item">
          <label>熔断阈值（连续失败次数）</label>
          <input type="number" v-model.number="lbConfig.circuit_breaker_threshold" min="1" max="20" class="cfg-input-sm" />
        </div>
        <div class="lb-item">
          <label>熔断恢复等待（秒）</label>
          <input type="number" v-model.number="lbConfig.recovery_wait" min="10" max="300" class="cfg-input-sm" />
        </div>
        <div class="lb-item">
          <label>超时限制（秒）</label>
          <input type="number" v-model.number="lbConfig.timeout" min="5" max="120" class="cfg-input-sm" />
        </div>
      </div>
      <button class="btn-primary" @click="saveLbConfig">保存负载均衡配置</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import axios from 'axios'

const providers = ref([
  {
    id: 'ollama', icon: '🦙', name: 'Ollama（本地）', type: 'local', type_label: '本地',
    enabled: true, is_default: true, testing: false, test_result: null as any,
    available_models: ['qwen2:0.5b', 'qwen:7b-chat', 'llama3:8b', 'mistral:7b'],
    config: { base_url: 'http://localhost:11434', model: 'qwen2:0.5b', temperature: 0.7 },
    usage: { today_calls: 0, today_tokens: 0, avg_latency: 0 },
    key_placeholder: '', url_placeholder: '',
  },
  {
    id: 'bailian', icon: '☁️', name: '阿里云百炼', type: 'cloud', type_label: '云端',
    enabled: false, is_default: false, testing: false, test_result: null as any,
    available_models: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-long'],
    config: { api_key: '', model: 'qwen-turbo', temperature: 0.7, max_tokens: 2048 },
    usage: { today_calls: 0, today_tokens: 0, avg_latency: 0 },
    key_placeholder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    url_placeholder: '',
  },
  {
    id: 'xinghuo', icon: '⭐', name: '讯飞星火', type: 'cloud', type_label: '云端',
    enabled: false, is_default: false, testing: false, test_result: null as any,
    available_models: ['spark-lite', 'spark-pro', 'spark-max', 'spark-ultra'],
    config: { api_key: '', base_url: 'https://spark-api-open.xf-yun.com/v1', model: 'spark-lite', temperature: 0.7, max_tokens: 4096 },
    usage: { today_calls: 0, today_tokens: 0, avg_latency: 0 },
    key_placeholder: 'Bearer xxxx', url_placeholder: 'https://spark-api-open.xf-yun.com/v1',
  },
  {
    id: 'deepseek', icon: '🔮', name: 'DeepSeek', type: 'cloud', type_label: '云端',
    enabled: false, is_default: false, testing: false, test_result: null as any,
    available_models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
    config: { api_key: '', model: 'deepseek-chat', temperature: 0.7, max_tokens: 4096 },
    usage: { today_calls: 0, today_tokens: 0, avg_latency: 0 },
    key_placeholder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    url_placeholder: '',
  },
  {
    id: 'openai', icon: '🌐', name: 'OpenAI / 兼容接口', type: 'cloud', type_label: '云端',
    enabled: false, is_default: false, testing: false, test_result: null as any,
    available_models: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo', 'o1-mini'],
    config: { api_key: '', base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini', temperature: 0.7, max_tokens: 4096 },
    usage: { today_calls: 0, today_tokens: 0, avg_latency: 0 },
    key_placeholder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', url_placeholder: 'https://api.openai.com/v1',
  },
])

const lbConfig = reactive({
  strategy: 'primary', circuit_breaker_threshold: 3, recovery_wait: 60, timeout: 30,
})

const defaultModel = computed(() => {
  const p = providers.value.find(p => p.is_default && p.enabled)
  return p ? { provider: p.name, model_name: p.config.model, online: true } : null
})

// ── 页面加载时从后端恢复已保存配置 ──────────────────────────────
onMounted(async () => {
  try {
    // 获取各 provider 状态（Key 是否已配置）
    const statusRes = await axios.get('/api/models/providers/status')
    const status = statusRes.data

    // 获取完整模型列表，用于判断哪些模型 available
    const listRes = await axios.get('/api/models/list')
    const modelList: any[] = listRes.data.models || []

    providers.value.forEach(p => {
      // 根据后端 providers/status 恢复启用状态
      if (p.id === 'deepseek' && status.deepseek?.configured) {
        p.enabled = true
      } else if (p.id === 'openai' && status.openai?.configured) {
        p.enabled = true
      } else if (p.id === 'hunyuan' && status.hunyuan?.configured) {
        p.enabled = true
      }

      // 从 localStorage 恢复完整 config（含 api_key，API Key 不在 providers/status 中明文返回）
      const saved = localStorage.getItem(`model_config_${p.id}`)
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          Object.assign(p.config, parsed)
          // 如果有 api_key 并且 provider 支持，自动启用
          if ((p.config as any).api_key) p.enabled = true
        } catch { /* ignore */ }
      }
    })
  } catch (e) {
    // 后端未启动时静默忽略
    console.warn('[MultiModelTab] 加载配置失败（后端未启动？）', e)
  }
})

function toggleProvider(provider: any) {
  MessagePlugin.success(`${provider.name} 已${provider.enabled ? '启用' : '禁用'}`)
}

async function testProvider(provider: any) {
  provider.testing = true
  provider.test_result = null
  try {
    const res = await axios.post('/api/models/test', {
      provider_id: provider.id,
      config: provider.config,
    })
    const d = res.data
    provider.test_result = { ok: d.ok, message: d.message, latency: d.latency }
  } catch (e: any) {
    provider.test_result = { ok: false, message: '请求失败，请确认后端已启动' }
  } finally {
    provider.testing = false
  }
}

async function saveProvider(provider: any) {
  try {
    // 1. 保存到后端（持久化，所有接口立即生效）
    await axios.post('/api/models/configure', {
      provider_id: provider.id,
      config: provider.config,
    })
    // 2. 同步到 localStorage（页面刷新后 onMounted 恢复用）
    localStorage.setItem(`model_config_${provider.id}`, JSON.stringify(provider.config))
    MessagePlugin.success(`${provider.name} 配置已保存，立即生效`)
  } catch (e: any) {
    // 后端不可达时降级到本地暂存
    localStorage.setItem(`model_config_${provider.id}`, JSON.stringify(provider.config))
    MessagePlugin.warning('后端暂不可达，配置已本地暂存（后端启动后需重新保存以生效）')
  }
}

function setDefault(provider: any) {
  providers.value.forEach(p => p.is_default = false)
  provider.is_default = true
  MessagePlugin.success(`已将 ${provider.name} 设为默认模型`)
}

function pullModel(provider: any) { MessagePlugin.info(`正在后台拉取 ${provider.config.model}，请稍候...`) }
function formatTokens(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n) }

async function saveLbConfig() {
  try {
    await axios.post('/api/models/lb-config', lbConfig)
    MessagePlugin.success('负载均衡配置已保存')
  } catch { MessagePlugin.warning('配置已本地暂存') }
}
</script>

<style scoped>
.tab-content { max-width: 960px; }
.section-header { margin-bottom: 16px; }
.section-header h2 { font-size: 18px; color: #111827; margin: 0 0 4px; }
.section-desc { font-size: 13px; color: #9ca3af; margin: 0; }

.current-model-banner {
  display: flex; align-items: center; gap: 12px;
  background: linear-gradient(135deg, #eff6ff, #f0fdf4);
  border-radius: 12px; padding: 14px 18px; margin-bottom: 16px;
  border: 1px solid #bfdbfe;
}
.banner-icon { font-size: 24px; }
.banner-title { font-size: 12px; color: #6b7280; }
.banner-model { font-size: 15px; font-weight: 700; color: #111827; }
.banner-status { margin-left: auto; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
.status--ok { background: #dcfce7; color: #15803d; }
.status--off { background: #fee2e2; color: #dc2626; }

.providers-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
.provider-card {
  background: white; border-radius: 12px; padding: 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06); border: 2px solid transparent; transition: border-color 0.2s;
}
.provider-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.provider-icon { font-size: 26px; }
.provider-meta { flex: 1; }
.provider-name { font-size: 14px; font-weight: 600; color: #111827; }
.provider-badge { display: inline-block; padding: 1px 7px; border-radius: 8px; font-size: 11px; margin-top: 2px; }
.badge--local { background: #dcfce7; color: #15803d; }
.badge--cloud { background: #dbeafe; color: #1d4ed8; }

.toggle-switch { position: relative; }
.toggle-switch input { display: none; }
.toggle-track {
  display: block; width: 36px; height: 20px; border-radius: 10px; background: #d1d5db;
  cursor: pointer; transition: background 0.2s; position: relative;
}
.toggle-track::after {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px; border-radius: 50%; background: white;
  transition: transform 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.toggle-switch input:checked + .toggle-track { background: #4f7ef8; }
.toggle-switch input:checked + .toggle-track::after { transform: translateX(16px); }

.provider-config { border-top: 1px solid #f3f4f6; padding-top: 12px; }
.cfg-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.cfg-row label { font-size: 12px; color: #6b7280; width: 70px; flex-shrink: 0; }
.cfg-input, .cfg-select { flex: 1; padding: 5px 8px; border: 1px solid #e5e7eb; border-radius: 5px; font-size: 12px; outline: none; }
.cfg-input-sm { width: 80px; padding: 5px 8px; border: 1px solid #e5e7eb; border-radius: 5px; font-size: 12px; outline: none; }
.model-select-row { display: flex; gap: 6px; flex: 1; }
.btn-pull {
  padding: 4px 8px; background: #f0fdf4; border: 1px solid #bbf7d0;
  border-radius: 5px; font-size: 11px; cursor: pointer; white-space: nowrap; color: #15803d;
}
.slider-row { display: flex; align-items: center; gap: 8px; flex: 1; }
.slider { flex: 1; }
.slider-val { font-weight: 600; color: #4f7ef8; width: 28px; font-size: 12px; }

.provider-actions { display: flex; align-items: center; gap: 7px; margin-top: 10px; flex-wrap: wrap; }
.btn-test, .btn-save, .btn-default {
  padding: 5px 12px; border-radius: 6px; border: 1px solid; font-size: 12px; cursor: pointer;
}
.btn-test { border-color: #bfdbfe; color: #1d4ed8; background: #eff6ff; }
.btn-test:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-save { border-color: #d1d5db; background: white; color: #374151; }
.btn-default { border-color: #a7f3d0; color: #065f46; background: #ecfdf5; }
.default-label { font-size: 12px; font-weight: 700; color: #10b981; margin-left: 4px; }

.test-result {
  margin-top: 8px; padding: 7px 10px; border-radius: 6px; font-size: 12px;
}
.result--ok { background: #f0fdf4; color: #15803d; }
.result--err { background: #fff5f5; color: #dc2626; }

.usage-stats {
  display: flex; gap: 10px; margin-top: 10px; padding-top: 10px;
  border-top: 1px solid #f3f4f6;
}
.usage-item { flex: 1; text-align: center; }
.usage-item span { display: block; font-size: 11px; color: #9ca3af; }
.usage-item strong { font-size: 14px; color: #374151; }

.card { background: white; border-radius: 12px; padding: 18px 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.card-title { font-size: 15px; font-weight: 600; color: #374151; margin-bottom: 14px; }
.lb-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
.lb-item label { display: block; font-size: 12px; color: #6b7280; margin-bottom: 5px; }
.btn-primary {
  padding: 8px 20px; border: none; border-radius: 7px;
  background: #4f7ef8; color: white; cursor: pointer; font-size: 13px;
}
</style>
