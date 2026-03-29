// 定义文件上传函数
import { Ref } from 'vue'
import axios from 'axios'
import { MessagePlugin } from 'tdesign-vue-next'

/**
 * 并发限流执行器：最多同时运行 maxConcurrency 个 Promise
 * 避免大批量上传触发浏览器同源并发限制（Chrome 最多 6 个）
 */
async function runWithConcurrencyLimit<T>(
  tasks: (() => Promise<T>)[],
  maxConcurrency = 3
): Promise<T[]> {
  const results: T[] = []
  let index = 0

  async function worker() {
    while (index < tasks.length) {
      const taskIndex = index++
      results[taskIndex] = await tasks[taskIndex]()
    }
  }

  const workers = Array.from({ length: Math.min(maxConcurrency, tasks.length) }, () => worker())
  await Promise.all(workers)
  return results
}

// 生成文件 hash，这里使用SHA256
const generateFileHash = async (file: File): Promise<string> => {
  // 检查文件参数是否有效
  if (!file) {
    throw new Error('文件对象为空')
  }

  if (!(file instanceof File)) {
    throw new Error('参数不是有效的File对象')
  }

  try {
    // 检查浏览器是否支持crypto.subtle API
    if (window.crypto && window.crypto.subtle) {
      const buffer = await file.arrayBuffer()
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)

      // 检查hashBuffer是否有效
      if (!hashBuffer) {
        throw new Error('生成文件哈希失败')
      }

      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
      return hashHex
    } else {
      // 备选方案：使用文件名、大小和最后修改时间生成标识符
      console.warn('浏览器不支持crypto.subtle API，使用备选方案生成文件标识符')
      const identifier = `${file.name}-${file.size}-${file.lastModified}`
      let hash = 0
      for (let i = 0; i < identifier.length; i++) {
        const char = identifier.charCodeAt(i)
        hash = (hash << 5) - hash + char
        hash = hash & hash // 转换为32位整数
      }
      return Math.abs(hash).toString(16)
    }
  } catch (error) {
    console.error('生成文件哈希时出错:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`生成文件哈希失败: ${errorMessage}`)
  }
}

// ... 已有代码 ...

export const uploadFiles = async (
  uploadedFiles: Ref<File[]>,
  isUploading: Ref<boolean>,
  uploadProgress: Ref<number>,
  KLB_id: string // 添加知识库ID参数
) => {
  // 检查参数
  if (!uploadedFiles || !uploadedFiles.value) {
    console.error('上传文件列表为空')
    MessagePlugin.error('上传文件列表为空')
    return
  }

  if (!KLB_id) {
    console.error('知识库ID为空')
    MessagePlugin.error('知识库ID为空')
    return
  }

  if (uploadedFiles.value.length === 0) return

  isUploading.value = true
  uploadProgress.value = 0

  // 存储每个文件的 fileName、fileHash 和 totalChunks
  const fileInfoList: { fileName: string; fileHash: string; totalChunks: number }[] = []

  try {
    for (const file of uploadedFiles.value) {
      // 检查文件是否有效
      if (!file) {
        console.warn('跳过空文件')
        continue
      }

      const chunkSize = 0.1 * 1024 * 1024 // 每个分块大小 512KB
      const totalChunks = Math.ceil(file.size / chunkSize)
      console.log(`文件 ${file.name} 分成了 ${totalChunks} 个分块`)
      let uploadedChunks = 0

      // 生成文件唯一标识，可根据文件内容生成 hash
      const fileHash = await generateFileHash(file)
      console.log(`文件 ${file.name} 的唯一标识为 ${fileHash}`)

      // 存储当前文件的信息，包含总块数
      fileInfoList.push({ fileName: file.name, fileHash, totalChunks })

      // 上传每个分块
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize
        const end = Math.min(file.size, start + chunkSize)
        const chunk = file.slice(start, end)

        const formData = new FormData()
        formData.append('chunk', chunk)
        formData.append('fileHash', fileHash)
        formData.append('chunkIndex', i.toString())
        formData.append('totalChunks', totalChunks.toString())
        formData.append('fileName', file.name)
        formData.append('KLB_id', KLB_id) // 添加知识库ID参数

        // 调用后端接口发送分块数据
        console.log(`正在上传文件 ${file.name} 的第 ${i + 1} 个分块`)
        console.log(`分块大小: ${chunk.size} bytes`)
        console.log(`分块索引: ${i}`)
        console.log(formData)
        console.log(KLB_id)

        await axios.post('/api/upload-chunk', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          },
          onUploadProgress: progressEvent => {
            // 检查 progressEvent.total 是否存在
            const total = progressEvent.total || 0
            // 计算当前分块的上传进度
            const chunkProgress = (progressEvent.loaded / total) * (100 / totalChunks)
            // 更新总的上传进度
            uploadProgress.value = Math.round(uploadedChunks * (100 / totalChunks) + chunkProgress)
          }
        })
        uploadedChunks++
      }
    }

    console.log('文件上传完成')
    MessagePlugin.success(
      '文件上传完成：' + (fileInfoList.length > 0 ? fileInfoList[0].fileName : '所有文件')
    )

    // 遍历文件信息列表，逐个调用上传完成接口（最大3并发，防止浏览器并发限制）
    const completeTasks = fileInfoList.map(fileInfo => async () => {
      return axios.post(
        '/api/upload-complete',
        {
          fileName: fileInfo.fileName,
          fileHash: fileInfo.fileHash,
          totalChunks: fileInfo.totalChunks || 1,
          KLB_id: KLB_id
        },
        { timeout: 60000 }
      ) // 60s 超时
    })
    await runWithConcurrencyLimit(completeTasks, 3)

    isUploading.value = false
    // 上传完成后可添加刷新文档列表等操作
  } catch (error) {
    console.error('文件上传失败:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    MessagePlugin.error('文件上传失败:' + errorMessage)
    isUploading.value = false
  }
}
