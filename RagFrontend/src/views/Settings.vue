<template>
  <div class="settings-win11">
    <!-- Win11 左侧导航栏 -->
    <aside class="settings-nav">
      <div class="settings-nav__header">
        <div class="settings-nav__icon">⚙️</div>
        <div class="settings-nav__title">系统设置</div>
      </div>
      <div v-for="group in tabGroups" :key="group.label" class="nav-group">
        <div class="nav-group__label">{{ group.label }}</div>
        <button
          v-for="tab in group.tabs" :key="tab.id"
          :class="['nav-item', { 'nav-item--active': activeTab === tab.id }]"
          @click="activeTab = tab.id"
        >
          <span class="nav-item__icon">{{ tab.icon }}</span>
          <span class="nav-item__label">{{ tab.label }}</span>
          <span v-if="tab.badge" class="nav-item__badge">{{ tab.badge }}</span>
        </button>
      </div>
    </aside>

    <!-- 右侧内容区 -->
    <main class="settings-main">
      <!-- 页面标题 -->
      <div class="settings-page-header">
        <h1 class="settings-page-title">{{ currentTab?.label }}</h1>
        <p class="settings-page-desc">{{ currentTab?.desc }}</p>
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

    <!-- ── 模型配置（用户自定义 Ollama 模型与超时） ──────────── -->
    <div v-if="activeTab === 'model-config'" class="tab-content">
      <div class="section-header">
        <h2>模型配置</h2>
        <p class="section-desc">自定义 Ollama 服务地址、模型名称和超时设置，解决"Ollama 请求超时"问题</p>
      </div>

      <!-- 已安装模型提示 -->
      <div class="mc-installed-bar" v-if="mcLocalModels.length">
        <span class="mc-installed-title">🟢 本地已安装模型：</span>
        <span
          v-for="m in mcLocalModels" :key="m"
          class="mc-model-chip"
          @click="mcForm.llm_model = m; mcForm.kg_model = m"
          title="点击快速填入"
        >{{ m }}</span>
      </div>
      <div class="mc-installed-bar mc-installed-bar--empty" v-else-if="mcLocalFetched">
        <span>⚠️ 未检测到本地已安装模型，请先在 Ollama 中执行 <code>ollama pull 模型名</code></span>
      </div>

      <!-- 表单 -->
      <div class="mc-form">
        <div class="mc-form-row">
          <label class="mc-label">Ollama 服务地址</label>
          <input v-model="mcForm.ollama_base_url" class="mc-input" placeholder="http://localhost:11434" />
          <button class="mc-btn-secondary" @click="mcFetchLocalModels" :disabled="mcLoadingLocal">
            {{ mcLoadingLocal ? '检测中...' : '🔍 检测本地模型' }}
          </button>
        </div>
        <div class="mc-form-row">
          <label class="mc-label">LLM 模型名<span class="mc-required">*</span></label>
          <input v-model="mcForm.llm_model" class="mc-input" placeholder="如：qwen2:0.5b / llama3:8b" />
          <span class="mc-hint">RAG 问答使用的主模型</span>
        </div>
        <div class="mc-form-row">
          <label class="mc-label">知识图谱模型</label>
          <input v-model="mcForm.kg_model" class="mc-input" placeholder="留空则复用 LLM 模型" />
        </div>
        <div class="mc-form-row">
          <label class="mc-label">Embedding 模型</label>
          <input v-model="mcForm.embedding_model" class="mc-input" placeholder="sentence-transformers/all-MiniLM-L6-v2" />
        </div>
        <div class="mc-form-row">
          <label class="mc-label">请求超时（秒）</label>
          <input v-model.number="mcForm.timeout" type="number" class="mc-input mc-input--short" min="30" max="600" />
          <span class="mc-hint">建议 120～300s，大模型可适当增大</span>
        </div>

        <!-- 操作按钮 -->
        <div class="mc-actions">
          <button class="mc-btn-test" @click="mcTestConfig" :disabled="mcTesting">
            {{ mcTesting ? '测试中...' : '🧪 测试连接' }}
          </button>
          <button class="mc-btn-save" @click="mcSaveConfig" :disabled="mcSaving">
            {{ mcSaving ? '保存中...' : '💾 保存配置' }}
          </button>
          <button class="mc-btn-reset" @click="mcLoadConfig">↺ 重置</button>
        </div>

        <!-- 测试结果 -->
        <div v-if="mcTestResult" :class="['mc-test-result', mcTestResult.ok ? 'mc-test-result--ok' : 'mc-test-result--err']">
          <span class="mc-test-icon">{{ mcTestResult.ok ? '✅' : '❌' }}</span>
          <span>{{ mcTestResult.message }}</span>
          <div v-if="mcTestResult.installed_models && !mcTestResult.ok" class="mc-installed-hint">
            已安装模型：{{ mcTestResult.installed_models.join(' / ') || '（无）' }}
          </div>
        </div>
      </div>

      <!-- 说明卡片 -->
      <div class="mc-tips-card">
        <h4>💡 常见超时原因与解决办法</h4>
        <ul>
          <li>模型参数过大（如 7b+），建议改用 <code>qwen2:0.5b</code>（~400MB，约 600MB 内存）</li>
          <li>Ollama 服务未启动 → 运行 <code>ollama serve</code></li>
          <li>模型未下载 → 运行 <code>ollama pull 模型名</code></li>
          <li>超时设置过短 → 将超时改为 300 秒</li>
          <li>使用 Docker 时 Ollama 地址应为 <code>http://host.docker.internal:11434</code></li>
        </ul>
      </div>
    </div>

    <!-- ── 8大方向扩展 Tab ──────────────────────────────────────── -->
    <OcrTab v-if="activeTab === 'ocr'" />
    <VersionTab v-if="activeTab === 'version'" />
    <RbacTab v-if="activeTab === 'rbac'" />
    <RagEvalTab v-if="activeTab === 'rageval'" />
    <EnterpriseToolsTab v-if="activeTab === 'tools'" />
    <MultiModelTab v-if="activeTab === 'multimodel'" />
    <ComplianceTab v-if="activeTab === 'compliance'" />

    <!-- ── 办公联动（扩展版，含钉钉/企微/Notion/GitHub） ──────── -->
    <div v-if="activeTab === 'integrations'" class="tab-content">
      <div class="section-header">
        <h2>办公联动</h2>
        <p class="section-desc">将知识库与主流办公平台无缝打通，让 AI 助力你的工作流</p>
      </div>

      <!-- 集成平台网格 -->
      <div class="integration-grid">
        <div v-for="p in integrationPlatforms" :key="p.id"
          :class="['integration-platform-card', { 'platform-card--active': activePlatform === p.id }]"
          @click="activePlatform = activePlatform === p.id ? '' : p.id">
          <div class="platform-logo">{{ p.emoji }}</div>
          <div class="platform-name">{{ p.name }}</div>
          <div class="platform-status">
            <span :class="['status-dot', p.connected ? 'dot--green' : 'dot--gray']"></span>
            {{ p.connected ? '已连接' : '未连接' }}
          </div>
        </div>
      </div>

      <!-- 配置面板 -->
      <transition name="slide-down">
        <div v-if="activePlatform" class="platform-config-panel">
          <!-- Obsidian -->
          <template v-if="activePlatform === 'obsidian'">
            <h3 class="panel-title">🟣 Obsidian Vault 同步</h3>
            <p class="panel-desc">将本地 Vault 中的 .md 笔记增量同步到知识库，支持 [[wikilink]] 解析</p>
            <div class="form-row"><label>Vault 路径</label>
              <input v-model="obsidianForm.vault_path" class="form-input" placeholder="C:\Users\你\Documents\ObsidianVault" />
            </div>
            <div class="form-row"><label>目标知识库 ID（可选）</label>
              <input v-model="obsidianForm.kb_id" class="form-input" placeholder="留空则导入到默认目录" />
            </div>
            <div class="form-row"><label>排除模式（正则，逗号分隔）</label>
              <input v-model="obsidianExclude" class="form-input" placeholder="templates/,\.trash/" />
            </div>
            <div class="form-actions">
              <button class="btn-primary" @click="configObsidian" :disabled="obsidianLoading">配置 Vault</button>
              <button class="btn-secondary" @click="syncObsidian" :disabled="obsidianLoading || !obsidianStatus.configured">
                {{ obsidianLoading ? '同步中...' : '立即同步' }}
              </button>
            </div>
            <div v-if="obsidianSyncResult" class="sync-result">
              <span class="sync-badge">+{{ obsidianSyncResult.added }}</span> 新增 ·
              <span class="sync-badge sync-badge--update">~{{ obsidianSyncResult.updated }}</span> 更新 ·
              <span class="sync-badge sync-badge--skip">{{ obsidianSyncResult.skipped }}</span> 跳过
            </div>
          </template>

          <!-- 飞书 -->
          <template v-else-if="activePlatform === 'feishu'">
            <h3 class="panel-title">🟦 飞书机器人</h3>
            <p class="panel-desc">在飞书群/私聊中 @ 机器人，自动触发知识库问答</p>
            <div class="form-row"><label>App ID</label>
              <input v-model="feishuForm.app_id" class="form-input" placeholder="cli_xxxxxxxxxxxxxxxx" />
            </div>
            <div class="form-row"><label>App Secret</label>
              <input v-model="feishuForm.app_secret" type="password" class="form-input" />
            </div>
            <div class="form-row"><label>Verification Token（可选）</label>
              <input v-model="feishuForm.verification_token" class="form-input" />
            </div>
            <div class="form-row"><label>默认知识库 ID（可选）</label>
              <input v-model="feishuForm.default_kb_id" class="form-input" placeholder="留空则直接 LLM 回答" />
            </div>
            <div class="form-actions">
              <button class="btn-primary" @click="configFeishu" :disabled="feishuLoading">保存配置</button>
            </div>
            <div class="webhook-box">
              <span class="webhook-label">Webhook 事件订阅地址：</span>
              <code class="webhook-url">{{ webhookUrl }}</code>
              <button class="btn-copy" @click="copyWebhook">复制</button>
            </div>
          </template>

          <!-- 钉钉 -->
          <template v-else-if="activePlatform === 'dingtalk'">
            <h3 class="panel-title">🔵 钉钉群机器人</h3>
            <p class="panel-desc">通过钉钉自定义机器人 Webhook 发送消息通知或接收知识库问答</p>
            <div class="form-row"><label>Webhook 地址</label>
              <input v-model="dingtalkConfig.webhook" class="form-input" placeholder="https://oapi.dingtalk.com/robot/send?access_token=..." />
            </div>
            <div class="form-row"><label>加签密钥（可选）</label>
              <input v-model="dingtalkConfig.secret" type="password" class="form-input" placeholder="SEC..." />
            </div>
            <div class="form-row"><label>关键词（消息过滤）</label>
              <input v-model="dingtalkConfig.keywords" class="form-input" placeholder="知识库,问答,AI" />
            </div>
            <div class="form-actions">
              <button class="btn-primary" @click="savePlatformConfig('dingtalk', dingtalkConfig)">保存配置</button>
              <button class="btn-secondary" @click="testPlatform('dingtalk')">发送测试消息</button>
            </div>
            <details class="guide-box"><summary>📋 钉钉配置步骤</summary>
              <ol>
                <li>钉钉群 → 群设置 → 机器人 → 添加机器人 → 自定义</li>
                <li>安全设置选择「加签」，复制密钥填写上方</li>
                <li>复制 Webhook 地址填写上方 → 保存 → 测试 ✅</li>
              </ol>
            </details>
          </template>

          <!-- 企业微信 -->
          <template v-else-if="activePlatform === 'wecom'">
            <h3 class="panel-title">💚 企业微信群机器人</h3>
            <p class="panel-desc">通过企业微信群机器人推送知识库更新通知</p>
            <div class="form-row"><label>Webhook 地址</label>
              <input v-model="wecomConfig.webhook" class="form-input" placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..." />
            </div>
            <div class="form-row"><label>消息类型</label>
              <select v-model="wecomConfig.msgtype" class="form-select">
                <option value="text">文本</option>
                <option value="markdown">Markdown</option>
              </select>
            </div>
            <div class="form-row"><label>@成员手机号（逗号分隔，@all=全员）</label>
              <input v-model="wecomConfig.mentioned_mobile_list" class="form-input" placeholder="13800000000,@all" />
            </div>
            <div class="form-actions">
              <button class="btn-primary" @click="savePlatformConfig('wecom', wecomConfig)">保存配置</button>
              <button class="btn-secondary" @click="testPlatform('wecom')">发送测试</button>
            </div>
          </template>

          <!-- Notion -->
          <template v-else-if="activePlatform === 'notion'">
            <h3 class="panel-title">⬛ Notion 数据库同步</h3>
            <p class="panel-desc">将 Notion 数据库内容同步到知识库，支持富文本和属性字段</p>
            <div class="form-row"><label>Integration Token</label>
              <input v-model="notionConfig.token" type="password" class="form-input" placeholder="secret_xxxxxxxx..." />
            </div>
            <div class="form-row"><label>数据库 ID（从 URL 获取）</label>
              <input v-model="notionConfig.database_id" class="form-input" placeholder="32位数据库 ID" />
            </div>
            <div class="form-row"><label>内容字段名（默认 Name）</label>
              <input v-model="notionConfig.content_field" class="form-input" placeholder="Name" />
            </div>
            <div class="form-actions">
              <button class="btn-primary" @click="savePlatformConfig('notion', notionConfig)">保存配置</button>
              <button class="btn-secondary" @click="testPlatform('notion')">立即同步</button>
            </div>
          </template>

          <!-- GitHub -->
          <template v-else-if="activePlatform === 'github'">
            <h3 class="panel-title">⬤ GitHub 仓库同步</h3>
            <p class="panel-desc">将仓库中的文档文件（md/txt/rst）自动同步到知识库</p>
            <div class="form-row"><label>Personal Access Token</label>
              <input v-model="githubConfig.token" type="password" class="form-input" placeholder="ghp_xxxxxxxxxxxx" />
            </div>
            <div class="form-row"><label>仓库（owner/repo）</label>
              <input v-model="githubConfig.repo" class="form-input" placeholder="username/my-docs" />
            </div>
            <div class="form-row"><label>分支</label>
              <input v-model="githubConfig.branch" class="form-input" placeholder="main" />
            </div>
            <div class="form-row"><label>文档路径前缀（可选）</label>
              <input v-model="githubConfig.path_prefix" class="form-input" placeholder="docs/" />
            </div>
            <div class="form-actions">
              <button class="btn-primary" @click="savePlatformConfig('github', githubConfig)">保存配置</button>
              <button class="btn-secondary" @click="testPlatform('github')">立即同步</button>
            </div>
          </template>
        </div>
      </transition>
    </div>

    <!-- 外观设置 -->
    <div v-if="activeTab === 'appearance'" class="tab-content">
      <div class="section-header">
        <h2>外观设置</h2>
        <p class="section-desc">自定义界面主题、颜色和字体，打造专属体验</p>
      </div>
      <div class="appearance-grid">
        <div class="appearance-card">
          <div class="appearance-card__title">🌗 主题模式</div>
          <div class="theme-options">
            <button v-for="t in themeOptions" :key="t.id"
              :class="['theme-btn', { 'theme-btn--active': appearance.theme === t.id }]"
              @click="setTheme(t.id)">
              <span class="theme-preview" :style="{ background: t.preview }"></span>
              {{ t.label }}
            </button>
          </div>
        </div>
        <div class="appearance-card">
          <div class="appearance-card__title">🎨 主题色</div>
          <div class="color-options">
            <button v-for="c in colorOptions" :key="c.id"
              :class="['color-btn', { 'color-btn--active': appearance.color === c.id }]"
              :style="{ background: c.value }"
              @click="setColor(c.id, c.value)"
              :title="c.label">
            </button>
          </div>
        </div>
        <div class="appearance-card">
          <div class="appearance-card__title">🔡 字体大小</div>
          <div class="font-size-options">
            <button v-for="f in fontSizeOptions" :key="f.id"
              :class="['font-btn', { 'font-btn--active': appearance.fontSize === f.id }]"
              @click="setFontSize(f.id, f.value)">
              {{ f.label }}
            </button>
          </div>
        </div>
        <div class="appearance-card">
          <div class="appearance-card__title">📐 布局紧凑度</div>
          <div class="layout-options">
            <button v-for="l in layoutOptions" :key="l.id"
              :class="['layout-btn', { 'layout-btn--active': appearance.layout === l.id }]"
              @click="appearance.layout = l.id; saveAppearance()">
              <span>{{ l.icon }}</span>{{ l.label }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 使用统计 -->
    <div v-if="activeTab === 'stats'" class="tab-content">
      <div class="section-header">
        <h2>使用统计</h2>
        <p class="section-desc">查看系统使用情况、Token消耗和知识库规模</p>
      </div>
      <div class="stats-grid">
        <div class="stats-big-card" v-for="s in statsCards" :key="s.label">
          <div class="stats-big-card__icon">{{ s.icon }}</div>
          <div class="stats-big-card__value">{{ s.value }}</div>
          <div class="stats-big-card__label">{{ s.label }}</div>
        </div>
      </div>
      <div class="stats-chart-placeholder">
        <div class="chart-placeholder-icon">📊</div>
        <p>近 7 日使用趋势图</p>
        <p class="text-xs text-gray-400">（接入 ECharts 后可视化展示）</p>
      </div>
    </div>

    <!-- 系统监控面板 -->
    <div v-if="activeTab === 'monitor'" class="tab-content">
      <div class="section-header">
        <h2>系统监控</h2>
        <p class="section-desc">实时监控 API 响应时间、模型调用次数、知识库上传量，支持 Prometheus + Grafana 接入</p>
      </div>

      <!-- 概览卡片 -->
      <div class="monitor-overview" v-if="monitorData">
        <div class="mon-card" v-for="c in monitorCards" :key="c.key">
          <div class="mon-icon">{{ c.icon }}</div>
          <div class="mon-value">{{ c.value }}</div>
          <div class="mon-label">{{ c.label }}</div>
        </div>
      </div>
      <div class="monitor-empty" v-else-if="!monitorLoading">
        暂无数据，后端监控中间件启动后自动上报
      </div>

      <!-- ECharts：请求量 + 响应时间 + 模型调用 -->
      <div v-if="monitorData" class="monitor-charts">
        <div class="mon-chart-box">
          <div class="mon-chart-title">📊 Top 接口请求量</div>
          <div ref="monReqRef" style="width:100%;height:260px;"></div>
        </div>
        <div class="mon-chart-box">
          <div class="mon-chart-title">⚡ 响应时间（avg / p99）</div>
          <div ref="monLatRef" style="width:100%;height:260px;"></div>
        </div>
        <div class="mon-chart-box">
          <div class="mon-chart-title">🤖 模型调用分布</div>
          <div ref="monModelRef" style="width:100%;height:260px;"></div>
        </div>
      </div>

      <!-- 操作栏 -->
      <div class="monitor-actions">
        <button class="mc-btn-secondary" @click="fetchMonitor" :disabled="monitorLoading">
          {{ monitorLoading ? '加载中...' : '🔄 刷新数据' }}
        </button>
        <a href="/metrics" target="_blank" class="mc-btn-secondary" style="text-decoration:none">
          📄 Prometheus /metrics
        </a>
        <span class="mon-tips">Grafana 抓取地址：<code>http://localhost:8000/metrics</code></span>
      </div>
    </div>

    <!-- 工单管理 -->
    <div v-if="activeTab === 'tickets'" class="tab-content">
      <div class="section-header">
        <h2>工单管理</h2>
        <p class="section-desc">提交问题反馈和功能请求，跟踪处理进度</p>
      </div>
      <button class="btn-primary mb-4" @click="showNewTicket = !showNewTicket">+ 提交工单</button>
      <div v-if="showNewTicket" class="ticket-form">
        <div class="form-row"><label>问题类型</label>
          <select v-model="newTicket.type" class="form-select">
            <option value="bug">Bug 报告</option>
            <option value="feature">功能请求</option>
            <option value="other">其他</option>
          </select>
        </div>
        <div class="form-row"><label>标题</label>
          <input v-model="newTicket.title" class="form-input" placeholder="简短描述问题..." />
        </div>
        <div class="form-row"><label>详细描述</label>
          <textarea v-model="newTicket.content" class="form-textarea" rows="4" placeholder="请详细描述问题..."></textarea>
        </div>
        <div class="form-actions">
          <button class="btn-cancel" @click="showNewTicket = false">取消</button>
          <button class="btn-primary" @click="submitTicket">提交工单</button>
        </div>
      </div>
      <div class="ticket-list">
        <div v-if="tickets.length === 0" class="empty-state">
          <div class="empty-icon">🎫</div>
          <p>暂无工单，运行良好 ✨</p>
        </div>
        <div v-for="ticket in tickets" :key="ticket.id" class="ticket-card">
          <div>
            <span :class="['ticket-type', `ticket-type--${ticket.type}`]">{{ ticket.type }}</span>
            <div class="ticket-title font-medium mt-1">{{ ticket.title }}</div>
            <div class="text-gray-400 text-xs mt-1">{{ formatDate(ticket.created_at) }}</div>
          </div>
          <span :class="['ticket-status', `ticket-status--${ticket.status}`]">{{ ticket.status }}</span>
        </div>
      </div>
    </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive, computed, nextTick } from 'vue'
import axios from 'axios'
import { MessagePlugin } from 'tdesign-vue-next'
import {
  applyTheme, applyColor, applyFontSize, applyLayout,
  saveAppearance as persistAppearance, loadAppearance, COLOR_MAP
} from '@/composables/useTheme'
import OcrTab from './SettingsTabs/OcrTab.vue'
import VersionTab from './SettingsTabs/VersionTab.vue'
import RbacTab from './SettingsTabs/RbacTab.vue'
import RagEvalTab from './SettingsTabs/RagEvalTab.vue'
import EnterpriseToolsTab from './SettingsTabs/EnterpriseToolsTab.vue'
import MultiModelTab from './SettingsTabs/MultiModelTab.vue'
import ComplianceTab from './SettingsTabs/ComplianceTab.vue'
import CommercialTab from './SettingsTabs/CommercialTab.vue'

const activeTab = ref('apikeys')

// Win11 风格分组导航
const tabGroups: Array<{label:string; tabs:Array<{id:string;label:string;icon:string;desc:string;badge?:string}>}> = [
  {
    label: '账号与安全',
    tabs: [
      { id: 'apikeys', label: 'API Key', icon: '🔑', desc: '管理开放接口密钥' },
      { id: 'rbac', label: '角色权限', icon: '🛡️', desc: '用户角色与权限管理' },
      { id: 'compliance', label: '合规中心', icon: '✅', desc: 'SSO/脱敏/限流配置' },
    ]
  },
  {
    label: '数据与存储',
    tabs: [
      { id: 'datasources', label: '多数据源', icon: '🗄️', desc: '连接外部数据源' },
      { id: 'version', label: '版本管理', icon: '📚', desc: '文档版本历史' },
      { id: 'ocr', label: 'OCR 解析', icon: '📄', desc: 'OCR文档识别配置' },
    ]
  },
  {
    label: 'AI 与模型',
    tabs: [
      { id: 'model-config', label: '模型配置', icon: '⚡', desc: '设置 Ollama 模型与超时' },
      { id: 'multimodel', label: '多模型', icon: '🤖', desc: '配置多个AI模型' },
      { id: 'rageval', label: 'RAG 评估', icon: '🔬', desc: '效果评估与调优' },
      { id: 'tools', label: '企业工具', icon: '🧰', desc: '11种企业级工具' },
    ]
  },
  {
    label: '集成与联动',
    tabs: [
      { id: 'integrations', label: '办公联动', icon: '🔗', desc: '飞书/钉钉/企微等' },
      { id: 'audit', label: '审计日志', icon: '📋', desc: '用户操作审计' },
    ]
  },
  {
    label: '个性化',
    tabs: [
      { id: 'appearance', label: '外观设置', icon: '🎨', desc: '主题/颜色/字体' },
    ]
  },
  {
    label: '系统',
    tabs: [
      { id: 'stats', label: '使用统计', icon: '📊', desc: '查看使用数据' },
      { id: 'monitor', label: '系统监控', icon: '📡', desc: 'API响应/模型调用' },
      { id: 'tickets', label: '工单管理', icon: '🎫', desc: '问题反馈与跟踪' },
    ]
  },
]

// 所有 tabs 平铺（供 currentTab computed 使用）
const allTabs = tabGroups.flatMap(g => g.tabs.map(t => ({ ...t, desc: t.desc || '' })))
const currentTab = computed(() => allTabs.find(t => t.id === activeTab.value))

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
  loadPlatformConfigs()
  mcLoadConfig()
  await Promise.all([fetchKeys(), fetchDatasources(), fetchAuditLogs(), fetchObsidianStatus(), fetchFeishuStatus(), fetchUsageStats(), fetchMonitor()])
})

// ── 模型配置 ─────────────────────────────────────────────────
const mcForm = reactive({
  llm_model: 'qwen2:0.5b',
  ollama_base_url: 'http://localhost:11434',
  timeout: 120,
  embedding_model: 'sentence-transformers/all-MiniLM-L6-v2',
  kg_model: '',
})
const mcSaving = ref(false)
const mcTesting = ref(false)
const mcLoadingLocal = ref(false)
const mcLocalModels = ref<string[]>([])
const mcLocalFetched = ref(false)
const mcTestResult = ref<{ ok: boolean; message: string; installed_models?: string[] } | null>(null)

async function mcLoadConfig() {
  try {
    const res = await axios.get('/api/user-model-config')
    const cfg = res.data?.config || {}
    Object.assign(mcForm, {
      llm_model: cfg.llm_model || 'qwen2:0.5b',
      ollama_base_url: cfg.ollama_base_url || 'http://localhost:11434',
      timeout: cfg.timeout ?? 120,
      embedding_model: cfg.embedding_model || 'sentence-transformers/all-MiniLM-L6-v2',
      kg_model: cfg.kg_model || '',
    })
    // 顺带拉本地模型
    await mcFetchLocalModels()
  } catch {
    // 后端未启动时静默失败
  }
}

async function mcFetchLocalModels() {
  mcLoadingLocal.value = true
  mcLocalFetched.value = false
  try {
    const res = await axios.get(`/api/user-model-config/local-models?base_url=${encodeURIComponent(mcForm.ollama_base_url)}`)
    mcLocalModels.value = res.data?.models || []
    mcLocalFetched.value = true
  } catch {
    mcLocalModels.value = []
    mcLocalFetched.value = true
  } finally {
    mcLoadingLocal.value = false
  }
}

async function mcSaveConfig() {
  if (!mcForm.llm_model.trim()) { MessagePlugin.warning('请填写模型名称'); return }
  mcSaving.value = true
  try {
    await axios.post('/api/user-model-config', {
      llm_model: mcForm.llm_model.trim(),
      ollama_base_url: mcForm.ollama_base_url.trim(),
      timeout: mcForm.timeout,
      embedding_model: mcForm.embedding_model.trim(),
      kg_model: mcForm.kg_model.trim() || null,
    })
    MessagePlugin.success('模型配置已保存，下次 RAG 查询生效')
  } catch {
    MessagePlugin.error('保存失败，请确认后端已启动')
  } finally {
    mcSaving.value = false
  }
}

async function mcTestConfig() {
  mcTesting.value = true
  mcTestResult.value = null
  try {
    const res = await axios.post('/api/user-model-config/test', {
      ollama_base_url: mcForm.ollama_base_url.trim(),
      llm_model: mcForm.llm_model.trim(),
      timeout: 10,
    })
    const d = res.data
    mcTestResult.value = {
      ok: d.ollama_reachable && d.model_installed,
      message: d.message,
      installed_models: d.installed_models,
    }
    if (d.installed_models) mcLocalModels.value = d.installed_models
  } catch (e: any) {
    mcTestResult.value = { ok: false, message: `请求失败: ${e?.message || e}` }
  } finally {
    mcTesting.value = false
  }
}

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

// ── 办公联动：新增平台 ────────────────────────────────────────
const activePlatform = ref('')

const dingtalkConfig = reactive({ webhook: '', secret: '', keywords: '知识库' })
const wecomConfig = reactive({ webhook: '', msgtype: 'markdown', mentioned_mobile_list: '' })
const notionConfig = reactive({ token: '', database_id: '', content_field: 'Name' })
const githubConfig = reactive({ token: '', repo: '', branch: 'main', path_prefix: 'docs/' })

// 从localStorage加载平台配置
function loadPlatformConfigs() {
  const saved = localStorage.getItem('integration_configs')
  if (saved) {
    try {
      const c = JSON.parse(saved)
      if (c.dingtalk) Object.assign(dingtalkConfig, c.dingtalk)
      if (c.wecom) Object.assign(wecomConfig, c.wecom)
      if (c.notion) Object.assign(notionConfig, c.notion)
      if (c.github) Object.assign(githubConfig, c.github)
    } catch {}
  }
}

async function savePlatformConfig(platform: string, config: any) {
  const saved = JSON.parse(localStorage.getItem('integration_configs') || '{}')
  saved[platform] = { ...config }
  localStorage.setItem('integration_configs', JSON.stringify(saved))
  MessagePlugin.success(`${platform} 配置已保存`)
  // 同时尝试发到后端
  try {
    await axios.post(`/api/integrations/${platform}/configure`, config)
  } catch {}
}

async function testPlatform(platform: string) {
  try {
    await axios.post(`/api/integrations/${platform}/test`)
    MessagePlugin.success('测试消息发送成功 ✅')
  } catch {
    MessagePlugin.warning('后端接口未就绪，配置已本地保存')
  }
}

// 集成平台列表（computed，动态显示连接状态）
const integrationPlatforms = computed(() => [
  { id: 'obsidian', name: 'Obsidian', emoji: '🟣', connected: obsidianStatus.value.configured },
  { id: 'feishu', name: '飞书', emoji: '🟦', connected: feishuStatus.value.configured },
  { id: 'dingtalk', name: '钉钉', emoji: '🔵', connected: !!dingtalkConfig.webhook },
  { id: 'wecom', name: '企业微信', emoji: '💚', connected: !!wecomConfig.webhook },
  { id: 'notion', name: 'Notion', emoji: '⬛', connected: !!notionConfig.token },
  { id: 'github', name: 'GitHub', emoji: '⬤', connected: !!githubConfig.token },
])

// ── 外观设置 ──────────────────────────────────────────────────
const appearance = reactive(loadAppearance())

const themeOptions = [
  { id: 'light', label: '浅色', preview: '#ffffff' },
  { id: 'dark', label: '深色', preview: '#1e1e2e' },
  { id: 'auto', label: '跟随系统', preview: 'linear-gradient(to right, #fff 50%, #1e1e2e 50%)' },
]
const colorOptions = [
  { id: 'blue',   label: '蓝色（默认）', value: COLOR_MAP.blue },
  { id: 'indigo', label: '靛蓝',        value: COLOR_MAP.indigo },
  { id: 'violet', label: '紫色',        value: COLOR_MAP.violet },
  { id: 'cyan',   label: '青色',        value: COLOR_MAP.cyan },
  { id: 'teal',   label: '绿松石',      value: COLOR_MAP.teal },
  { id: 'green',  label: '绿色',        value: COLOR_MAP.green },
  { id: 'orange', label: '橙色',        value: COLOR_MAP.orange },
  { id: 'rose',   label: '玫瑰红',      value: COLOR_MAP.rose },
]
const fontSizeOptions = [
  { id: 'small',  label: '小', value: '13px' },
  { id: 'medium', label: '中', value: '14px' },
  { id: 'large',  label: '大', value: '16px' },
]
const layoutOptions = [
  { id: 'compact',  label: '紧凑', icon: '▤' },
  { id: 'normal',   label: '默认', icon: '▥' },
  { id: 'spacious', label: '宽松', icon: '▦' },
]

function setTheme(id: string) {
  appearance.theme = id as any
  _saveAppearance()
  applyTheme(id as any)
}
function setColor(id: string, value: string) {
  appearance.color = id
  _saveAppearance()
  applyColor(id)
}
function setFontSize(id: string, value: string) {
  appearance.fontSize = id
  _saveAppearance()
  applyFontSize(id)
}
function _saveAppearance() {
  persistAppearance({ ...appearance } as any)
  MessagePlugin.success('外观设置已保存')
}
function saveAppearance() {
  _saveAppearance()
  applyLayout(appearance.layout)
}

// ── 使用统计 ──────────────────────────────────────────────────
const usageStats = ref({ total_queries: 0, total_tokens: 0, kb_count: 0, doc_count: 0 })
const statsCards = computed(() => [
  { icon: '💬', value: usageStats.value.total_queries, label: '累计问答次数' },
  { icon: '🪙', value: usageStats.value.total_tokens, label: '累计Token消耗' },
  { icon: '📚', value: usageStats.value.kb_count, label: '知识库数量' },
  { icon: '📄', value: usageStats.value.doc_count, label: '文档总数' },
])
async function fetchUsageStats() {
  try {
    const res = await axios.get('/api/stats/usage')
    usageStats.value = res.data
  } catch {}
}

// ── 系统监控 ──────────────────────────────────────────────────
const monitorData = ref<any>(null)
const monitorLoading = ref(false)
const monReqRef = ref<HTMLElement>()
const monLatRef = ref<HTMLElement>()
const monModelRef = ref<HTMLElement>()
const monitorCards = computed(() => {
  if (!monitorData.value) return []
  const ov = monitorData.value.overview
  return [
    { key: 'uptime',  icon: '⏱',  label: '运行时长(h)',  value: ov.uptime_h },
    { key: 'reqs',    icon: '📨',  label: '总请求数',    value: ov.total_reqs },
    { key: 'errors',  icon: '❌',  label: '错误请求',    value: ov.total_errors },
    { key: 'uploads', icon: '📤',  label: '上传文件数',  value: ov.kb_uploads },
    { key: 'models',  icon: '🤖',  label: '使用模型数',  value: ov.models_used },
  ]
})
async function fetchMonitor() {
  monitorLoading.value = true
  try {
    const res = await axios.get('/api/metrics/echarts')
    monitorData.value = res.data
    await nextTick()
    renderMonitorCharts()
  } catch {}
  finally { monitorLoading.value = false }
}
function renderMonitorCharts() {
  if (!monitorData.value) return
  try {
    // @ts-ignore
    const echarts = (window as any).echarts
    if (!echarts) {
      // 懒加载 echarts
      const s = document.createElement('script')
      s.src = 'https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js'
      s.onload = () => renderMonitorCharts()
      document.head.appendChild(s)
      return
    }
    const d = monitorData.value
    // 请求量横向柱
    if (monReqRef.value) {
      const c = echarts.init(monReqRef.value)
      c.setOption({ tooltip: {}, xAxis: { type: 'value' }, yAxis: { type: 'category', data: d.request_bar.endpoints.map((s: string) => s.slice(-30)) }, series: [{ type: 'bar', data: d.request_bar.counts, itemStyle: { color: '#6366f1' } }] })
    }
    // 响应时间
    if (monLatRef.value) {
      const c = echarts.init(monLatRef.value)
      c.setOption({ tooltip: {}, xAxis: { type: 'category', data: d.latency_bar.endpoints.map((s: string) => s.slice(-20)) }, yAxis: { type: 'value', axisLabel: { formatter: '{value}ms' } }, series: [{ name: 'avg', type: 'bar', data: d.latency_bar.avg_ms, itemStyle: { color: '#22c55e' } }, { name: 'p99', type: 'bar', data: d.latency_bar.p99_ms, itemStyle: { color: '#f59e0b' } }] })
    }
    // 模型饼图
    if (monModelRef.value) {
      const c = echarts.init(monModelRef.value)
      c.setOption({ tooltip: { trigger: 'item' }, series: [{ type: 'pie', radius: '60%', data: d.model_pie.length ? d.model_pie : [{ name: '暂无调用', value: 1 }] }] })
    }
  } catch {}
}

// ── 工单管理 ──────────────────────────────────────────────────
const tickets = ref<any[]>(JSON.parse(localStorage.getItem('local_tickets') || '[]'))
const showNewTicket = ref(false)
const newTicket = reactive({ type: 'bug', title: '', content: '' })

async function submitTicket() {
  if (!newTicket.title.trim()) { MessagePlugin.warning('请填写工单标题'); return }
  const ticket = {
    id: Date.now(),
    type: newTicket.type,
    title: newTicket.title,
    content: newTicket.content,
    status: 'open',
    created_at: new Date().toISOString(),
  }
  tickets.value.unshift(ticket)
  localStorage.setItem('local_tickets', JSON.stringify(tickets.value))
  // 尝试提交后端
  try {
    await axios.post('/api/tickets/submit', ticket)
  } catch {}
  MessagePlugin.success('工单已提交')
  showNewTicket.value = false
  Object.assign(newTicket, { type: 'bug', title: '', content: '' })
}

</script>

<style scoped>
.settings-page { height: 100vh; overflow: auto; background: #f9fafb; padding: 24px 32px; }

.settings-tabs {
  display: flex; gap: 4px; margin-bottom: 24px;
  background: white; border-radius: 10px; padding: 4px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  width: 100%; max-width: 100%; overflow-x: auto;
  flex-wrap: wrap;
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

/* ====== Win11 布局 ====== */
.settings-win11 {
  display: flex;
  height: 100vh;
  background: #f3f3f3;
  overflow: hidden;
}

/* 左侧导航 */
.settings-nav {
  width: 240px;
  flex-shrink: 0;
  background: rgba(255,255,255,0.85);
  backdrop-filter: blur(12px);
  border-right: 1px solid rgba(0,0,0,0.06);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 16px 8px;
}

.settings-nav__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px 18px;
}

.settings-nav__icon {
  font-size: 22px;
  line-height: 1;
}

.settings-nav__title {
  font-size: 16px;
  font-weight: 700;
  color: #1a1a2e;
}

.nav-group {
  margin-bottom: 4px;
}

.nav-group__label {
  font-size: 10.5px;
  font-weight: 600;
  color: #9ca3af;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  padding: 8px 12px 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 8px;
  font-size: 13.5px;
  color: #374151;
  text-align: left;
  transition: all 0.15s;
  position: relative;
}

.nav-item:hover {
  background: rgba(0,0,0,0.05);
}

.nav-item--active {
  background: rgba(79,126,248,0.12);
  color: #4f7ef8;
  font-weight: 600;
}

.nav-item--active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 3px;
  border-radius: 2px;
  background: #4f7ef8;
}

.nav-item__icon {
  font-size: 15px;
  width: 20px;
  text-align: center;
}

.nav-item__label {
  flex: 1;
}

.nav-item__badge {
  font-size: 10px;
  background: #ef4444;
  color: white;
  padding: 1px 5px;
  border-radius: 8px;
}

/* 右侧内容区 */
.settings-main {
  flex: 1;
  overflow-y: auto;
  padding: 28px 36px;
  background: #f3f3f3;
}

.settings-page-header {
  margin-bottom: 24px;
  border-bottom: 1px solid rgba(0,0,0,0.08);
  padding-bottom: 16px;
}

.settings-page-title {
  font-size: 24px;
  font-weight: 700;
  color: #1a1a2e;
  margin: 0 0 4px;
}

.settings-page-desc {
  font-size: 13px;
  color: #9ca3af;
  margin: 0;
}

/* 兼容旧的 .settings-page */
.settings-page {
  height: 100%;
  overflow: auto;
  background: transparent;
}

/* ====== 办公联动网格 ====== */
.integration-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.integration-platform-card {
  background: white;
  border-radius: 12px;
  border: 2px solid transparent;
  padding: 16px 12px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}

.integration-platform-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0,0,0,0.1);
}

.platform-card--active {
  border-color: #4f7ef8;
  background: #eff6ff;
}

.platform-logo {
  font-size: 28px;
  margin-bottom: 8px;
}

.platform-name {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 6px;
}

.platform-status {
  font-size: 11px;
  color: #9ca3af;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.dot--green { background: #10b981; }
.dot--gray { background: #d1d5db; }

/* 平台配置面板 */
.platform-config-panel {
  background: white;
  border-radius: 14px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  margin-top: 4px;
  border: 1px solid #e5e7eb;
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  margin: 0 0 6px;
}

.panel-desc {
  font-size: 13px;
  color: #6b7280;
  margin: 0 0 18px;
}

.guide-box {
  margin-top: 16px;
  font-size: 13px;
  color: #374151;
}

.guide-box summary {
  cursor: pointer;
  font-weight: 500;
  color: #4f7ef8;
  padding: 4px 0;
}

.guide-box ol {
  padding-left: 18px;
  margin-top: 8px;
  line-height: 1.9;
}

/* 过渡动效 */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-10px);
  max-height: 0;
}

.slide-down-enter-to,
.slide-down-leave-from {
  opacity: 1;
  transform: translateY(0);
  max-height: 1000px;
}

/* ====== 外观设置 ====== */
.appearance-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.appearance-card {
  background: white;
  border-radius: 12px;
  padding: 18px 20px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

.appearance-card__title {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 14px;
}

.theme-options,
.font-size-options,
.layout-options {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.theme-btn, .font-btn, .layout-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: 1.5px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  background: white;
  font-size: 13px;
  color: #374151;
  transition: all 0.15s;
}

.theme-btn--active, .font-btn--active, .layout-btn--active {
  border-color: #4f7ef8;
  background: #eff6ff;
  color: #4f7ef8;
}

.theme-preview {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1px solid rgba(0,0,0,0.1);
}

.color-options {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.color-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 3px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
}

.color-btn--active {
  border-color: rgba(0,0,0,0.3);
  transform: scale(1.15);
}

/* ====== 使用统计 ====== */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.stats-big-card {
  background: white;
  border-radius: 14px;
  padding: 20px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  position: relative;
  overflow: hidden;
}

.stats-big-card__icon {
  font-size: 28px;
  margin-bottom: 8px;
}

.stats-big-card__value {
  font-size: 28px;
  font-weight: 700;
  color: #4f7ef8;
  line-height: 1;
  margin-bottom: 6px;
}

.stats-big-card__label {
  font-size: 12px;
  color: #9ca3af;
}

.stats-chart-placeholder {
  background: white;
  border-radius: 14px;
  padding: 40px;
  text-align: center;
  color: #6b7280;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

.chart-placeholder-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

/* ====== 工单管理 ====== */
.ticket-form {
  background: white;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

.ticket-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ticket-card {
  background: white;
  border-radius: 10px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  border: 1px solid #f0f0f0;
}

.ticket-type {
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 4px;
  font-weight: 600;
}

.ticket-type--bug { background: #fee2e2; color: #dc2626; }
.ticket-type--feature { background: #dbeafe; color: #1d4ed8; }
.ticket-type--other { background: #f3f4f6; color: #6b7280; }

.ticket-status {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 20px;
}

.ticket-status--open { background: #fef9c3; color: #854d0e; }
.ticket-status--in_progress { background: #dbeafe; color: #1d4ed8; }
.ticket-status--closed { background: #dcfce7; color: #15803d; }

.mb-4 { margin-bottom: 16px; }

/* ── 系统监控面板 ──────────────────────────────────────────── */
.monitor-overview {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 10px;
  margin-bottom: 20px;
}
.mon-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14px 8px;
  background: var(--td-bg-color-container, #fff);
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  gap: 4px;
}
.mon-icon { font-size: 20px; }
.mon-value { font-size: 20px; font-weight: 700; color: #6366f1; }
.mon-label { font-size: 11px; color: #6b7280; }
.monitor-empty { color: #9ca3af; font-size: 13px; padding: 20px; text-align: center; }
.monitor-charts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 16px;
}
@media (max-width: 900px) { .monitor-charts { grid-template-columns: 1fr; } }
.mon-chart-box {
  background: var(--td-bg-color-container, #fff);
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 14px;
}
.mon-chart-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
.monitor-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.mon-tips { font-size: 12px; color: #6b7280; }
.mon-tips code { background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-family: monospace; }

/* ── 模型配置面板 ────────────────────────────────────────── */
.mc-installed-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 14px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  margin-bottom: 18px;
  font-size: 13px;
}
.mc-installed-bar--empty {
  background: #fffbeb;
  border-color: #fde68a;
  color: #92400e;
}
.mc-installed-title { font-weight: 600; color: #166534; white-space: nowrap; }
.mc-model-chip {
  display: inline-block;
  padding: 2px 10px;
  background: #dcfce7;
  color: #166534;
  border-radius: 12px;
  font-size: 12px;
  font-family: monospace;
  cursor: pointer;
  border: 1px solid #86efac;
  transition: background .2s;
}
.mc-model-chip:hover { background: #bbf7d0; }

.mc-form { display: flex; flex-direction: column; gap: 14px; margin-bottom: 20px; }
.mc-form-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.mc-label {
  min-width: 140px;
  font-size: 13px;
  font-weight: 500;
  color: var(--td-text-color-primary, #1a1a1a);
}
.mc-required { color: #ef4444; margin-left: 2px; }
.mc-input {
  flex: 1;
  min-width: 200px;
  max-width: 380px;
  padding: 7px 12px;
  border: 1px solid var(--td-component-border, #dcdcdc);
  border-radius: 6px;
  font-size: 13px;
  background: var(--td-bg-color-container, #fff);
  color: var(--td-text-color-primary, #1a1a1a);
  transition: border-color .2s;
}
.mc-input:focus { outline: none; border-color: #3b82f6; }
.mc-input--short { max-width: 100px; }
.mc-hint { font-size: 12px; color: #6b7280; }

.mc-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 6px; }
.mc-btn-save {
  padding: 8px 22px;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: background .2s;
}
.mc-btn-save:hover:not(:disabled) { background: #1d4ed8; }
.mc-btn-save:disabled { opacity: .6; cursor: not-allowed; }
.mc-btn-test {
  padding: 8px 18px;
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #86efac;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: background .2s;
}
.mc-btn-test:hover:not(:disabled) { background: #dcfce7; }
.mc-btn-test:disabled { opacity: .6; cursor: not-allowed; }
.mc-btn-secondary {
  padding: 7px 14px;
  background: #f9fafb;
  color: #374151;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.mc-btn-secondary:hover:not(:disabled) { background: #f3f4f6; }
.mc-btn-reset {
  padding: 8px 14px;
  background: transparent;
  color: #6b7280;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}
.mc-btn-reset:hover { background: #f9fafb; }

.mc-test-result {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 13px;
  margin-top: 4px;
}
.mc-test-result--ok { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
.mc-test-result--err { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
.mc-test-icon { font-size: 16px; }
.mc-installed-hint { font-size: 12px; color: #374151; margin-top: 4px; }

.mc-tips-card {
  padding: 16px 20px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  font-size: 13px;
  color: #78350f;
}
.mc-tips-card h4 { margin: 0 0 10px; font-size: 14px; }
.mc-tips-card ul { margin: 0; padding-left: 18px; }
.mc-tips-card li { margin-bottom: 6px; line-height: 1.5; }
.mc-tips-card code {
  background: #fef3c7;
  padding: 1px 5px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 12px;
}
</style>
