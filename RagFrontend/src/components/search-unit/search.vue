<template>
  <div class="search-box">
    <input
      v-model="searchKeyword"
      type="text"
      placeholder="搜索知识库"
      class="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
      @input="handleSearch"
    />
    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-5 w-5 text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { useCardDataStore } from '@/store'
// 搜索关键词
const searchKeyword = ref('')
const cardDataStore = useCardDataStore()
let timer: any = null

// 搜索处理函数
const handleSearch = () => {
  // 执行搜索逻辑，比如调用接口、过滤列表等
  if (timer) {
    clearTimeout(timer)
  }
  timer = setTimeout(() => {
    if (searchKeyword.value === '') {
      cardDataStore.resetFilters()
      timer = null
      return
    }
    cardDataStore.filterCardData(searchKeyword.value)
    console.log('搜索关键词:', searchKeyword.value)
    MessagePlugin.success(`正在搜索：“${searchKeyword.value}”`)
    timer = null
  }, 300) // 300毫秒的防抖延时
  //添加了一个搜索防抖
}
// 实际项目里搜索接口是异步的，所以这里使用 await 等待接口返回结果，实际项目里的形式为：
// await searchKnowledge(searchKeyword.value);
// 过滤本地列表数据
// 清空搜索框
//searchKeyword.value = '';
//有后端了就可以区修改这个查询逻辑
</script>
<style scoped>
.search-box {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  width: 300px;
  max-width: 250px;
}

.search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  outline: none;
  height: 100%;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: #007bff;
}

.search-button {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  padding: 8px 12px;
  border: none;
  background-color: #007bff;
  color: white;
  border-radius: 4px;
  height: 100%;
  cursor: pointer;
  transition: background-color 0.2s;
}

.search-button:hover {
  background-color: #0056b3;
}
</style>
