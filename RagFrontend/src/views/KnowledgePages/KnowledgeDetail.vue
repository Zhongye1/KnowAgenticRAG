<template>
  <div class="max-w-7xl mx-auto max-h-screen overflow-auto p-[7vw] x-6 py-8">
    <div class="flex items-center mb-6">
      <button @click="$router.back()" class="mr-3 text-gray-600 hover:text-blue-600">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      </button>
      <h1 class="text-2xl font-semibold text-gray-800">
        知识库: {{ kbName || '加载中...' }}
      </h1>
    </div>

    <!-- 数据集管理部分 -->
    <div class="bg-white shadow rounded-lg p-6 mb-8">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-medium">数据集</h2>
        <p class="text-sm text-gray-500">解析成功后才能问答哦。</p>
      </div>

      <!-- 操作工具栏 -->
      <div class="flex justify-between items-center mb-6">
        <div class="flex items-center">
          <div class="relative">
            <select
              class="border bg-gray-50 text-gray-700 py-2 pl-4 pr-10 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              v-model="filterStatus">
              <option>全部</option>
              <option>启用</option>
              <option>禁用</option>
            </select>
          </div>
          <div class="relative ml-3">
            <input type="text" placeholder="搜索文件"
              class="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              v-model="searchQuery" />
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24"
                stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>
        <!-- 添加上传按钮 -->
        <button @click="showUploadModal = true"
          class="bg-blue-600 hover:bg-blue-700  text-white font-bold px-4 py-2 rounded-md ">
          上传文件
        </button>
      </div>

      <!-- 文档列表 -->
      <div class="border rounded-lg overflow-hidden">
        <div class="grid grid-cols-12 gap-4 bg-gray-50 p-4 font-medium text-gray-600 border-b">
          <div class="col-span-1 flex justify-center">

          </div>
          <div class="col-span-4">名称</div>
          <div class="col-span-2">分块数</div>
          <div class="col-span-2">上传日期</div>
          <div class="col-span-2">切片方法</div>
          <div class="col-span-1">启用</div>
        </div>


        <div v-if="displayedDocuments.length > 0">
          <div v-for="(doc) in displayedDocuments" :key="doc.id"
            class="grid grid-cols-12 gap-4 p-4 items-center hover:bg-gray-50 border-b">
            <div class="col-span-1 flex justify-center">
              <button @click="deleteSelectedDocuments(doc.id)" class="text-gray-400 hover:text-red-500">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24"
                  stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
            <div class="col-span-4 flex items-center">
              <div class="flex-shrink-0 mr-3">
                <template v-if="doc.fileType === 'pdf'">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24"
                    stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </template>
                <template v-else-if="doc.fileType === 'docx'">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24"
                    stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </template>
                <template v-else>
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24"
                    stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </template>
              </div>
              <div>
                <div class="font-medium text-gray-800">{{ doc.name }}</div>
                <div class="text-sm text-gray-500">{{ doc.fileType.toUpperCase() }}</div>
              </div>
            </div>
            <div class="col-span-2 text-gray-600">{{ doc.chunks }}</div>
            <div class="col-span-2 text-gray-600">{{ formatDate(doc.uploadDate) }}</div>
            <div class="col-span-2 text-gray-600">{{ doc.slicingMethod }}</div>
            <div class="col-span-1 flex justify-center">
              <button @click="toggleDocumentStatus(doc)" :class="[
                'relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none',
                doc.enabled ? 'bg-blue-600' : 'bg-gray-200'
              ]" role="switch" aria-checked="false">
                <span :class="[
                  'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200',
                  doc.enabled ? 'translate-x-5' : 'translate-x-0'
                ]" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>


        <div v-else class="p-8 text-center text-gray-500">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto mb-4 text-gray-400" fill="none"
            viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p class="mb-1 font-medium">暂无文件</p>
          <p>请上传文件以建立知识库</p>
        </div>
      </div>

      <!-- 分页控件 -->
      <div class="flex items-center justify-between border-t px-4 py-3 sm:px-6 mt-4">
        <div class="flex flex-1 justify-between sm:hidden">
          <button :disabled="currentPage === 1" :class="[
            'relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium',
            currentPage === 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-50'
          ]">
            上一页
          </button>
          <button :disabled="currentPage === totalPages" :class="[
            'relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium',
            currentPage === totalPages ? 'text-gray-300 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-50'
          ]">
            下一页
          </button>
        </div>
        <div class="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
          <div>
            <p class="text-sm text-gray-700">
              显示第
              <span class="font-medium">{{ (currentPage - 1) * itemsPerPage + 1 }}</span>
              至
              <span class="font-medium">{{ Math.min(currentPage * itemsPerPage, filteredDocuments.length) }}</span>
              条， 共
              <span class="font-medium">{{ filteredDocuments.length }}</span>
              条
            </p>
          </div>
          <div>
            <nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
              <button @click="currentPage = currentPage - 1" :disabled="currentPage === 1" :class="[
                'relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0',
                currentPage === 1 ? 'cursor-not-allowed opacity-50' : ''
              ]">
                <span class="sr-only">上一页</span>
                <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd"
                    d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
                    clip-rule="evenodd" />
                </svg>
              </button>
              <template v-for="page in visiblePages" :key="page">
                <button @click="currentPage = page" :aria-current="currentPage === page ? 'page' : undefined" :class="[
                  'relative inline-flex items-center px-4 py-2 text-sm font-semibold',
                  currentPage === page
                    ? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                    : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:outline-offset-0'
                ]">
                  {{ page }}
                </button>
              </template>
              <button @click="currentPage = currentPage + 1" :disabled="currentPage === totalPages" :class="[
                'relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0',
                currentPage === totalPages ? 'cursor-not-allowed opacity-50' : ''
              ]">
                <span class="sr-only">下一页</span>
                <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd"
                    d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                    clip-rule="evenodd" />
                </svg>
              </button>
            </nav>
          </div>
        </div>
      </div>
    </div>







    <!-- 检索测试部分 -->
    <div class="bg-white shadow rounded-lg p-6 mb-8">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-medium">检索模块</h2>
        <div class="flex items-center gap-3">
          <!-- 实现方式切换 Tab -->
          <div class="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              @click="ragMode = 'langchain'"
              :class="[
                'px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200',
                ragMode === 'langchain'
                  ? 'bg-white text-blue-700 shadow-sm border border-blue-200'
                  : 'text-gray-500 hover:text-gray-700'
              ]"
            >
              🔗 LangChain
            </button>
            <button
              @click="ragMode = 'native'"
              :class="[
                'px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200',
                ragMode === 'native'
                  ? 'bg-white text-green-700 shadow-sm border border-green-200'
                  : 'text-gray-500 hover:text-gray-700'
              ]"
            >
              ⚡ 原生实现
            </button>
          </div>
          <button @click="isHelpVisible = !isHelpVisible" class="text-gray-500 hover:text-blue-600">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
      </div>

      <!-- 模式说明 -->
      <div class="mb-4">
        <div v-if="ragMode === 'langchain'" class="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
          <span class="mt-0.5">🔗</span>
          <div>
            <span class="font-semibold">LangChain 实现</span>：使用 LangChain + langchain_huggingface + langchain_community（FAISS）进行向量化，通过 LangChain OllamaLLM 生成回答。
            优点：生态完善、链式组合灵活；缺点：依赖较重、版本复杂。
          </div>
        </div>
        <div v-else class="flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
          <span class="mt-0.5">⚡</span>
          <div>
            <span class="font-semibold">原生实现</span>：使用 sentence-transformers + faiss-cpu 原生接口进行向量化，通过直接调用 Ollama HTTP API（/api/generate）生成回答，<strong>完全不依赖 LangChain</strong>。
            优点：轻量透明、依赖少、易于理解；缺点：需自行管理加载/分块逻辑。
          </div>
        </div>
      </div>

      <div v-if="isHelpVisible" class="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
        <p class="text-sm text-blue-700">
          <template v-if="ragMode === 'langchain'">
            【LangChain RAG】使用 LangChain 封装层进行向量化和检索。先点击"执行向量化处理"，再输入问题执行检索。
          </template>
          <template v-else>
            【原生 RAG】直接使用 faiss-cpu + sentence-transformers + Ollama HTTP API。先点击"执行向量化处理（原生）"，再输入问题执行检索。
          </template>
        </p>
      </div>




      <!-- 流式处理结果展示 -->
      <div v-if="isIngesting || ingestResults.length > 0" class="border rounded-lg overflow-hidden mb-6">
        <div class="bg-gray-50 px-4 py-3 border-b flex justify-between items-center">
          <h3 class="text-lg font-medium text-gray-700">处理输出</h3>
          <div v-if="isIngesting" class="flex items-center text-blue-600">
            <svg class="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none"
              viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
              </path>
            </svg>
            <span>处理中...</span>
          </div>
          <div v-else-if="ingestComplete" class="text-green-600 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clip-rule="evenodd" />
            </svg>
            <span>处理完成</span>
          </div>
        </div>


        <div class="p-4 bg-gray-50 max-h-60 overflow-auto font-mono text-sm">
          <div v-for="(result, index) in ingestResults" :key="index" class="pb-1">
            <div v-if="result.includes('{')">
              <!-- 尝试格式化JSON -->
              <pre class="text-green-600">{{ formatJsonOutput(result) }}</pre>
            </div>
            <div v-else class="text-gray-700">{{ result }}</div>
          </div>
        </div>
      </div>


      <!-- 测试按钮和结果 -->
      <div class="flex justify-start mb-4">
        <button @click="runSearchTest" :disabled="isTesting" :class="[
          'text-white px-6 py-2 rounded-md font-medium flex items-center',
          ragMode === 'langchain'
            ? 'bg-blue-600 hover:bg-blue-700'
            : 'bg-green-600 hover:bg-green-700',
          isTesting ? 'opacity-50 cursor-not-allowed' : ''
        ]">
          <svg v-if="isTesting" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg"
            fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
            </path>
          </svg>
          {{ isTesting ? '处理中...' : (ragMode === 'langchain' ? '🔗 执行向量化处理（LangChain）' : '⚡ 执行向量化处理（原生）') }}
        </button>
      </div>

      <!-- 检索参数设置 -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">



        <!---
        <div>
          <div class="flex items-center">
            <label class="block text-sm font-medium text-gray-700 mb-2 mr-4">使用知识图谱</label>
            <button @click="useKnowledgeGraph = !useKnowledgeGraph" :class="[
              'relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500',
              useKnowledgeGraph ? 'bg-blue-600' : 'bg-gray-200'
            ]" role="switch">
              <span :class="[
                'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200',
                useKnowledgeGraph ? 'translate-x-5' : 'translate-x-0'
              ]" aria-hidden="true" />
            </button>
          </div>
        </div>-->
      </div>

      <!-- 跨语言搜索 --><!---
      <div class="mb-6">
        <label class="block text-sm font-medium text-gray-700 mb-2">跨语言搜索</label>
        <select v-model="selectedLanguage"
          class="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500">
          <option value="auto">自动检测</option>
          <option value="zh-CN">简体中文</option>
        </select>
      </div>-->


      <!-- 测试文本和文件选择 -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div class="lg:col-span-2">
          <label class="block text-sm font-medium text-gray-700 mb-2">
            向量化处理后，进行 RAG 检索
            <span v-if="ragMode === 'langchain'" class="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">LangChain</span>
            <span v-else class="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">原生</span>
          </label>
          <textarea v-model="testQuery" rows="4"
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="输入问题以执行检索..."></textarea>
        </div>
      </div>

      <!-- 查询按钮 -->
      <div class="flex justify-start mb-4">
        <button @click="performRagQuery" :disabled="isQuerying || testQuery.trim() === ''" :class="[
          'text-white px-6 py-2 rounded-md font-medium flex items-center',
          ragMode === 'langchain'
            ? 'bg-blue-600 hover:bg-blue-700'
            : 'bg-green-600 hover:bg-green-700',
          (isQuerying || testQuery.trim() === '') ? 'opacity-50 cursor-not-allowed' : ''
        ]">
          <svg v-if="isQuerying" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg"
            fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
            </path>
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24"
            stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {{ isQuerying ? '生成中...' : (ragMode === 'langchain' ? '🔗 执行检索（LangChain）' : '⚡ 执行检索（原生）') }}
        </button>
      </div>


      <!-- 查询结果显示 -->
      <div v-if="queryResults.length > 0" class="border rounded-lg overflow-hidden mb-6">
        <div class="bg-gray-50 px-4 py-3 border-b flex justify-between items-center">
          <h3 class="text-lg font-medium text-gray-700">检索结果</h3>
          <div v-if="isQuerying" class="flex items-center text-blue-600">
            <svg class="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none"
              viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
              </path>
            </svg>
            <span>生成中...</span>
          </div>
          <div v-else-if="queryComplete" class="text-green-600 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clip-rule="evenodd" />
            </svg>
            <span>完成</span>
          </div>
        </div>

        <!-- 查询结果内容 -->
        <div class="p-4 bg-white">
          <div v-if="finalAnswer" class="mb-4 border-l-4 border-green-500 pl-4 py-2">
            <h4 class="font-medium text-lg mb-2">回答结果：</h4>
            <div class="text-gray-700 whitespace-pre-wrap">{{ finalAnswer }}</div>
          </div>

          <div v-if="sources.length > 0" class="mt-4">
            <h4 class="font-medium text-gray-700 mb-2">参考来源：</h4>
            <ul class="list-disc pl-5 text-sm text-gray-600">
              <li v-for="(source, index) in sources" :key="index" class="mb-1">
                {{ source.source }} (页码: {{ parseInt(source.page) + 1 }})
              </li>
            </ul>
          </div>

          <div class="mt-4 border-t pt-4">
            <h4 class="font-medium text-gray-700 mb-2">详细处理过程：</h4>
            <div class="max-h-80 overflow-auto font-mono text-sm text-gray-700 whitespace-pre-wrap break-words leading-6">
              {{ queryResults.join('') }}
            </div>
          </div>
        </div>
      </div>


    </div>


    <div class="bg-white shadow rounded-lg p-6 mb-8">
      <Knowledge_graph_setting :kb-name="`${kbName || ''}`" :kb-id="`${id || ''}`"
        :kb-description="`${kbDescription || ''}`" />


    </div>















    <!-- 上传文件模态框 -->
    <div v-if="showUploadModal" class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl">
        <div class="p-6">
          <div class="flex justify-between items-center pb-4 border-b">
            <h3 class="text-xl font-semibold text-gray-800">上传文件</h3>
            <button @click="showUploadModal = false" class="text-gray-500 hover:text-gray-700">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24"
                stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="mt-6">
            <div @click="fileInput?.click()"
              class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500"
              @dragover.prevent="dragover = true" @dragleave="dragover = false" @drop.prevent="handleFileDrop">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mx-auto text-gray-400" fill="none"
                viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p class="mt-4 text-lg font-medium text-gray-700">将文件拖到此处或点击上传</p>
              <p class="mt-1 text-sm text-gray-500">支持 PDF、DOCX、TXT 文件 (最大 50MB)</p>
              <input type="file" ref="fileInput" @change="handleFileUpload" class="hidden" multiple
                accept=".pdf,.docx,.txt">
              <button class="mt-6 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-md font-medium">
                选择文件
              </button>
            </div>

            <div v-if="uploadedFiles.length > 0" class="mt-6">
              <h4 class="text-lg font-medium text-gray-700 mb-4">待上传的文件</h4>
              <ul class="divide-y divide-gray-200">
                <li v-for="(file, index) in uploadedFiles" :key="index" class="py-4 flex items-center">
                  <div class="flex-shrink-0 mr-4">
                    <svg v-if="file.name.endsWith('.pdf')" class="h-10 w-10 text-red-500" fill="none"
                      viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <svg v-else-if="file.name.endsWith('.docx')" class="h-10 w-10 text-blue-500" fill="none"
                      viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <svg v-else class="h-10 w-10 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-gray-900 truncate">{{ file.name }}</p>
                    <p class="text-sm text-gray-500">{{ (file.size / 1024).toFixed(2) }} KB</p>
                  </div>
                  <button @click="removeUploadedFile(index)" class="ml-4 text-gray-400 hover:text-red-500">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24"
                      stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </li>
              </ul>
            </div>

            <!-- 上传进度条 -->
            <div v-if="isUploading" class="mt-6">
              <div class="bg-gray-200 rounded-full overflow-hidden">
                <div class="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  :style="{ width: uploadProgress + '%' }"></div>
              </div>
              <p class="mt-2 text-sm text-gray-500">{{ uploadProgress }}%</p>
            </div>

            <div class="mt-6 flex justify-end">
              <button @click="showUploadModal = false"
                class="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-md font-medium mr-3 hover:bg-gray-50">
                取消
              </button>
              <button @click="processFileUpload" :disabled="uploadedFiles.length === 0 || isUploading" :class="[
                'bg-blue-600 text-white px-4 py-2 rounded-md font-medium',
                uploadedFiles.length === 0 || isUploading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'
              ]">
                <svg v-if="isUploading" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
                  </path>
                </svg>
                {{ isUploading ? '上传中...' : '上传文件' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <knowledgeSettingCard :kb-name="kbName || ''" :kb-id="`${id || ''}`" :kb-description="kbDescription || ''"
      @save="saveKnowledgeBaseSettings" @delete="showDeleteConfirmation = true" />
    <!-- 删除知识库确认模态框 -->
    <div v-if="showDeleteConfirmation"
      class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div class="p-6">
          <div class="flex justify-between items-center pb-4 border-b">
            <h3 class="text-xl font-semibold text-gray-800">删除知识库</h3>
            <button @click="showDeleteConfirmation = false" class="text-gray-500 hover:text-gray-700">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24"
                stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>


          <div class="mt-4">
            <p class="text-gray-700 mb-6">
              确定要删除这个知识库吗？此操作不可恢复。
            </p>


            <div class="flex justify-end">
              <button @click="showDeleteConfirmation = false"
                class="bg-gray-200 text-gray-700 px-4 py-2 rounded-md font-medium mr-3 hover:bg-gray-300">
                取消
              </button>
              <button @click="deleteKnowledgeBase"
                class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md font-medium">
                确认删除
              </button>

            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import knowledgeSettingCard from './knowledge-setting-card.vue';
import API_ENDPOINTS from '@/utils/apiConfig';

const fileInput = ref<HTMLInputElement | null>(null);


const route = useRoute();
const router = useRouter();
const id = ref(route.params.id || 'ASF');
const kbName = ref('加载中...');
const kbDescription = ref('加载中...');

// 数据集管理功能
const searchQuery = ref('');
const showUploadModal = ref(false);
const uploadedFiles = ref<File[]>([]);
const isUploading = ref(false);
const dragover = ref(false);
const currentPage = ref(1);
const itemsPerPage = ref(5);
const showDeleteConfirmation = ref(false);

// 在已有状态变量旁边添加
const queryResults = ref<string[]>([]);
const isQuerying = ref(false);
const queryComplete = ref(false);
const finalAnswer = ref('');
const sources = ref<Source[]>([]);


interface Source {
  source: string;
  page: string;
  // 根据实际需要添加其他字段
}

// 检索测试功能
const filterStatus = ref('全部');

// 将检索配置初始值设为默认值，等待后端数据更新
const isHelpVisible = ref(true);
const similarityThreshold = ref(0.7); // 设置为合理的默认值
const keywordWeight = ref(50); // 设置为合理的默认值
const selectedRerankModel = ref('bge-large'); // 设置默认模型
const useKnowledgeGraph = ref(false);
const selectedLanguage = ref('auto'); // 设置默认语言

/** 
const rerankModels = ref([
  { label: 'bge-reranker-base', value: 'bge-base' },
  { label: 'bge-reranker-large', value: 'bge-large' },
  { label: '没有 Rerank 模型', value: 'none' }
]);
*/
// 加载状态
const configLoading = ref(true);

const testQuery = ref('');
const isTesting = ref(false);
//const selectedFilesForTest = ref<Document[]>([]);
const searchResults = ref<SearchResult[]>([]);
const uploadProgress = ref(0);


// 添加在已有状态变量旁边
const ingestResults = ref<string[]>([]);
const isIngesting = ref(false);
const ingestComplete = ref(false);

// RAG 模式切换：'langchain' | 'native'
const ragMode = ref<'langchain' | 'native'>('langchain');


// 更新接口类型定义以匹配实际响应
interface KnowledgeBaseConfig {
  // 基本信息
  id: string;
  title: string;
  avatar: string;
  description: string;
  createdTime: string;
  cover: string;

  // 嵌入和分块设置
  embedding_model: string;
  chunk_size: number;
  chunk_overlap: number;
  vector_dimension: number;

  // 解析器设置
  pdfParser: string;
  docxParser: string;
  excelParser: string;
  csvParser: string;
  txtParser: string;
  segmentMethod: string;

  // 检索设置
  similarity_threshold: number;
  convert_table_to_html: boolean;
  preserve_layout: boolean;
  remove_headers: boolean;

  // 知识图谱设置
  extract_knowledge_graph: boolean;
  kg_method: string;
  selected_entity_types: string[];
  entity_normalization: boolean;
  community_report: boolean;
  relation_extraction: boolean;

  // 其他设置
  name: string;
}

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

interface Document {
  id: number;
  name: string;
  fileType: string;
  chunks: number;
  uploadDate: string;
  slicingMethod: string;
  enabled: boolean;
  file_size: number;
  file_hash: string;
}

interface SearchResult {
  source: string;
  content: string;
  file: string;
  chunk: number;
  score: number;
}

const documents = ref<Document[]>([]);
let intervalId: number | null = null;

const KLB_id = route.params.id as string;

// 获取知识库配置的函数
const fetchKnowledgeBaseConfig = async () => {
  try {
    configLoading.value = true;


    const response = await axios.get<ApiResponse<KnowledgeBaseConfig>>(
      API_ENDPOINTS.KNOWLEDGE.GET_ITEM(KLB_id),
      {
        headers: {
          'accept': 'application/json'
        }
      }
    );

    if (response.data.code === 200) {
      const config = response.data.data;

      // 更新基本信息
      kbName.value = config.title || config.name || 'Unknown Knowledge Base';
      kbDescription.value = config.description || '暂无描述';

      // 更新检索测试相关配置
      similarityThreshold.value = config.similarity_threshold || 0.7;

      // 从知识图谱设置推断其他配置
      useKnowledgeGraph.value = config.extract_knowledge_graph || false;

      // 注意：接口没有返回以下字段，保持默认值或从其他地方获取
      // keywordWeight.value = config.keyword_weight || 50;
      // selectedRerankModel.value = config.rerank_model || 'bge-large';
      // selectedLanguage.value = config.cross_language || 'auto';

      console.log('知识库配置获取成功:', config);
    } else {
      console.error('获取配置失败:', response.data.message);
      setDefaultConfig();
    }
  } catch (error) {
    console.error('获取知识库配置失败:', error);
    setDefaultConfig();
  } finally {
    configLoading.value = false;
  }
};

// 设置默认配置值的函数
const setDefaultConfig = () => {
  kbName.value = '获取失败';
  kbDescription.value = '无法获取知识库信息';
  similarityThreshold.value = 0.7;
  keywordWeight.value = 50;
  selectedRerankModel.value = 'bge-large';
  useKnowledgeGraph.value = false;
  selectedLanguage.value = 'auto';
};

// 保存检索配置到后端
/** 
const saveRetrievalConfig = async () => {
  try {
    const configData = {
      similarity_threshold: similarityThreshold.value,
      keyword_weight: keywordWeight.value,
      rerank_model: selectedRerankModel.value,
      use_knowledge_graph: useKnowledgeGraph.value,
      cross_language: selectedLanguage.value
    };

    const response = await axios.post(
      `/api/update-knowledgebase-config/${KLB_id}`,
      configData,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.success) {
      console.log('检索配置保存成功');
    }
  } catch (error) {
    console.error('保存检索配置失败:', error);
  }
};*/

// 运行搜索测试 - 调用后端接口（根据 ragMode 选择端点）
const runSearchTest = async () => {
  isTesting.value = true;
  isIngesting.value = true;
  ingestResults.value = [];
  ingestComplete.value = false;
  searchResults.value = [];

  const endpoint = ragMode.value === 'langchain'
    ? API_ENDPOINTS.KNOWLEDGE.INGEST
    : API_ENDPOINTS.KNOWLEDGE.NATIVE_INGEST;

  try {
    const docsDir = `local-KLB-files/${KLB_id}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ docs_dir: docsDir })
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            ingestResults.value.push(data);
            if (data.includes('"message":') && (data.includes('Successfully ingested') || data.includes('向量化完成'))) {
              try {
                const jsonData = JSON.parse(data);
                console.log("Ingestion complete:", jsonData);
                ingestComplete.value = true;
              } catch (e) {
                console.error("Error parsing final JSON message", e);
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('向量化请求失败:', error);
    ingestResults.value.push(`错误: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    isIngesting.value = false;
    isTesting.value = false;
  }
};

// 添加一个函数来执行实际搜索（如果该函数尚未实现）
/** 
const performSearch = async () => {
  // 如果没有查询文本，则不执行搜索
  if (testQuery.value.trim() === '') return;

  try {
    const response = await axios.post('/api/search-test', {
      knowledge_base_id: KLB_id,
      query: testQuery.value,
      similarity_threshold: similarityThreshold.value,
      language: selectedLanguage.value,
    });

    if (response.data.success) {
      searchResults.value = response.data.data.results || [];
    } else {
      console.error('搜索测试失败:', response.data.message);
    }
  } catch (error) {
    console.error('搜索测试请求失败:', error);
  }
};*/

//RAG查询（根据 ragMode 选择端点）
const performRagQuery = async () => {
  if (isQuerying.value || testQuery.value.trim() === '') return;

  isQuerying.value = true;
  queryResults.value = [];
  queryComplete.value = false;
  finalAnswer.value = '';
  sources.value = [];

  const endpoint = ragMode.value === 'langchain'
    ? API_ENDPOINTS.KNOWLEDGE.QUERY
    : API_ENDPOINTS.KNOWLEDGE.NATIVE_QUERY;

  try {
    const docsDir = `local-KLB-files/${KLB_id}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query: testQuery.value, docs_dir: docsDir })
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let answerBuffer = '';
    let inAnswer = false;

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.substring(6).trim();
          if (!data) continue;

          queryResults.value.push(data);

          // 处理来源信息
          if (data.startsWith('SOURCES:')) {
            try {
              const sourcesJson = data.substring(8).trim();
              const parsedSources = JSON.parse(sourcesJson);
              sources.value = parsedSources.map((s: any) => ({
                source: s.file_name || s.source_path || '未知',
                page: String(s.page ?? '')
              }));
            } catch (_) { /* ignore */ }
            continue;
          }

          // 完成标志
          if (data === 'COMPLETE' || data.startsWith('COMPLETE:')) {
            queryComplete.value = true;
            if (data.startsWith('COMPLETE:')) {
              try {
                const jsonData = JSON.parse(data.substring(9).trim());
                finalAnswer.value = jsonData.answer || finalAnswer.value;
                sources.value = jsonData.sources || sources.value;
              } catch (_) { /* ignore */ }
            }
            continue;
          }

          // 跳过状态信息行（中括号开头的都是日志）
          if (data.startsWith('[原生RAG]') || data.startsWith('正在') || data.startsWith('开始') ||
              data.startsWith('检索完成') || data.startsWith('向量') || data.startsWith('ERROR')) {
            continue;
          }

          // 正文 token 累积
          if (!data.startsWith('{') && data !== 'COMPLETE') {
            answerBuffer += data;
            finalAnswer.value = answerBuffer;
          }
        }
      }
    }
  } catch (error) {
    console.error('RAG查询请求失败:', error);
    queryResults.value.push(`错误: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    isQuerying.value = false;
  }
};


// 其余的函数保持不变
const displayedDocuments = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value;
  const end = start + itemsPerPage.value;
  return filteredDocuments.value.slice(start, end);
});

const filteredDocuments = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  let filteredDocs = documents.value;

  if (query) {
    filteredDocs = filteredDocs.filter(doc =>
      doc.name.toLowerCase().includes(query) ||
      doc.fileType.toLowerCase().includes(query) ||
      doc.slicingMethod.toLowerCase().includes(query)
    );
  }

  if (filterStatus.value === '启用') {
    filteredDocs = filteredDocs.filter(doc => doc.enabled);
  } else if (filterStatus.value === '禁用') {
    filteredDocs = filteredDocs.filter(doc => !doc.enabled);
  }

  return filteredDocs;
});

const deleteSelectedDocuments = async (documentId: number) => {
  try {
    console.log('要删除的文档ID:', documentId);
    console.log('知识库ID:', KLB_id);

    await axios.post(`/api/delete-documents/`, {
      documentIds: [documentId]
    }, {
      params: {
        KLB_id: KLB_id
      }
    });

    const index = documents.value.findIndex(doc => doc.id === documentId);
    if (index > -1) {
      documents.value.splice(index, 1);
    }
  } catch (error) {
    console.error('删除文档失败:', error);
  }
};

const totalPages = computed(() =>
  Math.ceil(filteredDocuments.value.length / itemsPerPage.value)
);

const visiblePages = computed(() => {
  const pages = [];
  const start = Math.max(1, currentPage.value - 2);
  const end = Math.min(totalPages.value, currentPage.value + 2);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  return pages;
});

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('zh-CN');
};

const handleFileUpload = (event: Event) => {
  const input = event.target as HTMLInputElement;
  if (input.files) {
    for (let i = 0; i < input.files.length; i++) {
      const file = input.files[i];
      uploadedFiles.value.push(file);
    }
  }
};

const handleFileDrop = (event: DragEvent) => {
  dragover.value = false;
  if (event.dataTransfer?.files) {
    for (let i = 0; i < event.dataTransfer.files.length; i++) {
      uploadedFiles.value.push(event.dataTransfer.files[i]);
    }
  }
};

const removeUploadedFile = (index: number) => {
  uploadedFiles.value.splice(index, 1);
};

import { uploadFiles } from './file-upload';
import { MessagePlugin } from 'tdesign-vue-next';
import Knowledge_graph_setting from './knowledge_graph_setting.vue';

const processFileUpload = async () => {
  await uploadFiles(uploadedFiles, isUploading, uploadProgress, KLB_id);

  try {
    const response = await axios.get<Document[]>(API_ENDPOINTS.KNOWLEDGE.DOCUMENTS_LIST(KLB_id), {
      headers: {
        'accept': 'application/json'
      }
    });
    documents.value = response.data;
    uploadedFiles.value = [];
  } catch (error) {
    console.error('刷新文档列表失败:', error);
  }
};

const toggleDocumentStatus = async (doc: Document) => {
  try {
    const response = await axios.post('/api/update-document-status', {
      documentId: doc.id,
      enabled: !doc.enabled
    });

    if (response.status === 200) {
      doc.enabled = !doc.enabled;
      console.log('文档状态已更新', doc.enabled);
    } else {
      console.error('更新文档状态失败:', response.statusText);
    }
  } catch (error) {
    console.error('更新文档状态失败:', error);
  }
};

const saveKnowledgeBaseSettings = (settings: { name: string; description: string }) => {
  kbName.value = settings.name;
  kbDescription.value = settings.description;

  axios.post(`/api/update-knowledgebase-config/${id.value}`, {
    name: settings.name,
    description: settings.description
  })
    .then(response => {
      console.log('知识库设置已保存成功', response.data);
    })
    .catch(error => {
      console.error('保存知识库设置失败:', error);
    });
};

const deleteKnowledgeBase = async () => {
  try {
    router.push('/knowledge');

    const response = await axios.delete(`/api/delete-knowledgebase/${id.value}`);

    if (response.status === 200) {
      console.log('知识库已成功删除', id.value);
      MessagePlugin.success('知识库删除成功');
      showDeleteConfirmation.value = false;
    } else {
      console.error('删除知识库失败:', response.data);
      MessagePlugin.error('知识库删除失败');
    }
  } catch (error) {
    console.error('删除知识库请求失败:', error);
  }
};

/** 
const removeFileFromTest = (id: number) => {
  const index = selectedFilesForTest.value.findIndex(file => file.id === id);
  if (index !== -1) {
    selectedFilesForTest.value.splice(index, 1);
  }
};
*/

// 将此函数移动到组件顶层作用域
const formatJsonOutput = (text: string) => {
  try {
    // 如果字符串包含JSON对象，提取并格式化它
    const jsonMatch = text.match(/{.*}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[0];
      const parsedJson = JSON.parse(jsonStr);
      return JSON.stringify(parsedJson, null, 2);
    }
    return text;
  } catch (e) {
    console.error('解析JSON失败:', e);
    return text; // 如果解析失败，返回原始文本
  }
};

// 页面挂载时获取数据
onMounted(async () => {
  // 获取知识库配置（包含基本信息）
  await fetchKnowledgeBaseConfig();

  // 获取文档列表
  const fetchDocuments = async () => {
    try {
      const response = await axios.get<Document[]>(
        API_ENDPOINTS.KNOWLEDGE.DOCUMENTS_LIST(KLB_id),
        {
          headers: {
            'accept': 'application/json'
          }
        }
      );
      documents.value = response.data;
    } catch (error) {
      console.error('获取文档数据失败:', error);
    }
  };

  await fetchDocuments();
});

onUnmounted(() => {
  if (intervalId) {
    window.clearInterval(intervalId);
  }
});
</script>


<style scoped>
.dragover {
  border-color: #3b82f6;
  background-color: #eff6ff;
}

.app-container {
  background-color: #f9fafb;
  height: 100vh;
  width: 100vw;
  position: fixed;
  z-index: -1;
  overflow-x: hidden;
}
</style>