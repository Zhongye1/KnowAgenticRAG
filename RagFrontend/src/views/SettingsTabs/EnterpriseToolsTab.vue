<template>
  <div class="tab-content">
    <div class="section-header">
      <h2>企业工具套件</h2>
      <p class="section-desc">Agent 可调用的企业级工具：数据分析、图表生成、邮件、翻译、PDF 导出等</p>
    </div>

    <!-- 工具卡片网格 -->
    <div class="tools-grid">
      <div v-for="tool in tools" :key="tool.id" class="tool-card" :class="{ 'tool-card--active': tool.enabled }">
        <div class="tool-header">
          <span class="tool-icon">{{ tool.icon }}</span>
          <div class="tool-info">
            <div class="tool-name">{{ tool.name }}</div>
            <div class="tool-desc">{{ tool.desc }}</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" v-model="tool.enabled" @change="saveToolState(tool)" />
            <span class="toggle-track"></span>
          </label>
        </div>
        <div v-if="tool.enabled && tool.config" class="tool-config">
          <template v-if="tool.id === 'email'">
            <div class="cfg-row"><label>SMTP Host</label><input v-model="tool.config.smtp_host" class="cfg-input" placeholder="smtp.163.com" /></div>
            <div class="cfg-row"><label>发件人邮箱</label><input v-model="tool.config.sender" class="cfg-input" /></div>
            <div class="cfg-row"><label>授权码</label><input v-model="tool.config.password" type="password" class="cfg-input" /></div>
          </template>
          <template v-if="tool.id === 'translate'">
            <div class="cfg-row"><label>翻译引擎</label>
              <select v-model="tool.config.engine" class="cfg-select">
                <option value="baidu">百度翻译</option>
                <option value="deepl">DeepL</option>
                <option value="google">Google 翻译</option>
                <option value="ollama">本地 Ollama（免费）</option>
              </select>
            </div>
            <div class="cfg-row" v-if="tool.config.engine !== 'ollama'">
              <label>API Key</label><input v-model="tool.config.api_key" class="cfg-input" />
            </div>
          </template>
          <template v-if="tool.id === 'chart'">
            <div class="cfg-row"><label>图表渲染器</label>
              <select v-model="tool.config.renderer" class="cfg-select">
                <option value="echarts">ECharts（前端）</option>
                <option value="matplotlib">Matplotlib（后端）</option>
                <option value="plotly">Plotly</option>
              </select>
            </div>
          </template>
          <template v-if="tool.id === 'pdf_export'">
            <div class="cfg-row"><label>PDF 引擎</label>
              <select v-model="tool.config.engine" class="cfg-select">
                <option value="weasyprint">WeasyPrint</option>
                <option value="wkhtmltopdf">wkhtmltopdf</option>
                <option value="pdfkit">pdfkit</option>
              </select>
            </div>
            <div class="cfg-row"><label>页面模板</label>
              <select v-model="tool.config.template" class="cfg-select">
                <option value="default">默认报告</option>
                <option value="minimal">简约风格</option>
                <option value="corporate">企业风格</option>
              </select>
            </div>
          </template>
          <button class="cfg-save" @click="saveTool(tool)">保存</button>
        </div>
        <!-- 使用示例 -->
        <div class="tool-example" v-if="tool.enabled">
          <div class="example-label">Agent 调用示例</div>
          <code class="example-code">{{ tool.example }}</code>
        </div>
      </div>
    </div>

    <!-- 工具调用日志 -->
    <div class="card" style="margin-top: 16px;">
      <div class="card-header">
        <span class="card-title">📊 工具调用日志</span>
        <button class="btn-sm" @click="refreshLogs">刷新</button>
      </div>
      <div class="tool-logs">
        <div v-for="log in toolLogs" :key="log.id" class="log-row">
          <span class="log-time">{{ formatTime(log.ts) }}</span>
          <span class="log-tool">{{ tools.find(t => t.id === log.tool_id)?.icon }} {{ log.tool_name }}</span>
          <span class="log-input">{{ log.input.slice(0, 40) }}...</span>
          <span :class="['log-status', log.ok ? 'status--ok' : 'status--err']">
            {{ log.ok ? '✓ 成功' : '✗ 失败' }}
          </span>
          <span class="log-dur">{{ log.duration_ms }}ms</span>
        </div>
        <div v-if="toolLogs.length === 0" class="empty-hint">暂无工具调用记录</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import axios from 'axios'

const tools = ref([
  {
    id: 'data_analysis', icon: '📊', name: '数据分析', enabled: true,
    desc: '分析 CSV/Excel 数据，生成统计摘要和洞察报告',
    config: null,
    example: 'Agent: 分析这份销售数据，找出增长最快的品类',
  },
  {
    id: 'chart', icon: '📈', name: '图表生成', enabled: true,
    desc: '根据数据自动生成折线图、柱状图、饼图等可视化图表',
    config: { renderer: 'echarts' },
    example: 'Agent: 用柱状图展示各月销售额对比',
  },
  {
    id: 'email', icon: '📧', name: '邮件发送', enabled: false,
    desc: '通过 SMTP 发送通知邮件、报告摘要或提醒',
    config: { smtp_host: '', sender: '', password: '' },
    example: 'Agent: 将分析报告发送到 manager@company.com',
  },
  {
    id: 'translate', icon: '🌐', name: '智能翻译', enabled: true,
    desc: '自动检测语言，支持中英日韩等多语种翻译',
    config: { engine: 'ollama', api_key: '' },
    example: 'Agent: 将这份英文报告翻译成中文',
  },
  {
    id: 'pdf_export', icon: '📋', name: 'PDF 导出', enabled: true,
    desc: '将对话结果、知识摘要导出为格式化 PDF',
    config: { engine: 'weasyprint', template: 'default' },
    example: 'Agent: 将本次对话内容导出为 PDF 报告',
  },
  {
    id: 'web_search', icon: '🔍', name: '联网搜索', enabled: true,
    desc: 'DuckDuckGo 无 Key 联网搜索，补充实时信息',
    config: null,
    example: 'Agent: 搜索最新的 RAG 论文进展',
  },
  {
    id: 'code_exec', icon: '💻', name: '代码执行', enabled: false,
    desc: '在沙箱中执行 Python 代码，适合数值计算和数据处理',
    config: null,
    example: 'Agent: 用 Python 计算这组数据的标准差',
  },
  {
    id: 'calendar', icon: '📅', name: '日历提醒', enabled: false,
    desc: '创建日程提醒，集成飞书/钉钉日历',
    config: null,
    example: 'Agent: 为明天下午 3 点的会议创建提醒',
  },
])

const toolLogs = ref([
  { id: 1, ts: Date.now()/1000 - 300, tool_id: 'translate', tool_name: '翻译', input: 'Translate: Knowledge retrieval best practices...', ok: true, duration_ms: 842 },
  { id: 2, ts: Date.now()/1000 - 1200, tool_id: 'chart', tool_name: '图表', input: '生成 2024 年月度销售柱状图', ok: true, duration_ms: 1240 },
  { id: 3, ts: Date.now()/1000 - 3600, tool_id: 'web_search', tool_name: '搜索', input: '搜索：RAG 最新进展 2024', ok: false, duration_ms: 5000 },
])

function saveToolState(tool: any) {
  localStorage.setItem(`tool_enabled_${tool.id}`, String(tool.enabled))
  MessagePlugin.success(`${tool.name}已${tool.enabled ? '启用' : '禁用'}`)
}

async function saveTool(tool: any) {
  try {
    await axios.post('/api/tools/configure', { tool_id: tool.id, config: tool.config })
    MessagePlugin.success(`${tool.name} 配置已保存`)
  } catch {
    localStorage.setItem(`tool_config_${tool.id}`, JSON.stringify(tool.config))
    MessagePlugin.warning('配置已本地暂存')
  }
}

function refreshLogs() { MessagePlugin.info('日志已刷新') }
function formatTime(ts: number) { return new Date(ts * 1000).toLocaleTimeString('zh-CN', { hour12: false }) }
</script>

<style scoped>
.tab-content { max-width: 960px; }
.section-header { margin-bottom: 20px; }
.section-header h2 { font-size: 18px; color: #111827; margin: 0 0 4px; }
.section-desc { font-size: 13px; color: #9ca3af; margin: 0; }

.tools-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.tool-card {
  background: white; border-radius: 12px; padding: 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  border: 2px solid transparent; transition: border-color 0.2s;
}
.tool-card--active { border-color: #bfdbfe; }
.tool-header { display: flex; align-items: flex-start; gap: 10px; }
.tool-icon { font-size: 24px; flex-shrink: 0; line-height: 1.2; }
.tool-info { flex: 1; }
.tool-name { font-size: 14px; font-weight: 600; color: #111827; }
.tool-desc { font-size: 12px; color: #6b7280; margin-top: 2px; line-height: 1.4; }

.toggle-switch { position: relative; flex-shrink: 0; }
.toggle-switch input { display: none; }
.toggle-track {
  display: block; width: 36px; height: 20px; border-radius: 10px;
  background: #d1d5db; cursor: pointer; transition: background 0.2s;
  position: relative;
}
.toggle-track::after {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px; border-radius: 50%;
  background: white; transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.toggle-switch input:checked + .toggle-track { background: #4f7ef8; }
.toggle-switch input:checked + .toggle-track::after { transform: translateX(16px); }

.tool-config {
  margin-top: 12px; padding-top: 12px; border-top: 1px solid #f3f4f6;
}
.cfg-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.cfg-row label { font-size: 12px; color: #6b7280; width: 90px; flex-shrink: 0; }
.cfg-input, .cfg-select {
  flex: 1; padding: 5px 8px; border: 1px solid #e5e7eb;
  border-radius: 5px; font-size: 12px; outline: none;
}
.cfg-save {
  margin-top: 4px; padding: 5px 14px; background: #4f7ef8; color: white;
  border: none; border-radius: 5px; cursor: pointer; font-size: 12px;
}
.tool-example {
  margin-top: 10px; padding: 8px 10px; background: #f9fafb; border-radius: 6px;
}
.example-label { font-size: 11px; color: #9ca3af; margin-bottom: 4px; }
.example-code { font-size: 11.5px; color: #374151; font-family: monospace; line-height: 1.5; display: block; }

.card { background: white; border-radius: 12px; padding: 18px 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.card-header { display: flex; align-items: center; margin-bottom: 12px; }
.card-title { font-size: 15px; font-weight: 600; color: #374151; }
.btn-sm { margin-left: auto; padding: 5px 12px; border: 1px solid #d1d5db; border-radius: 6px; background: white; font-size: 12px; cursor: pointer; }

.tool-logs { display: flex; flex-direction: column; gap: 6px; }
.log-row {
  display: grid; grid-template-columns: 80px 100px 1fr 70px 55px;
  align-items: center; gap: 10px;
  font-size: 12px; padding: 8px 10px; background: #f9fafb; border-radius: 6px;
}
.log-time { color: #9ca3af; font-family: monospace; }
.log-tool { font-weight: 500; color: #374151; white-space: nowrap; overflow: hidden; }
.log-input { color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.log-status { font-weight: 600; text-align: right; white-space: nowrap; }
.status--ok { color: #10b981; }
.status--err { color: #ef4444; }
.log-dur { color: #9ca3af; text-align: right; }
.empty-hint { text-align: center; color: #9ca3af; font-size: 13px; padding: 20px; }
</style>
