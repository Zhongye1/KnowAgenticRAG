<template>
  <div class="error-container">
    <div class="error-content">
      <img
        src="https://picx.zhimg.com/80/v2-f58285d1aa6ef461cc4a5edd8f251407_720w.webp"
        alt="404错误"
        class="error-image"
      />
      <h1 class="error-title">404 not found</h1>
      <p class="error-message">抱歉，您访问的页面不存在或已被移除</p>
      <router-link to="/" class="return-button"> 返回首页 </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
// 404页面不需要特殊逻辑
</script>

<style scoped>
.error-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: calc(100vh - 60px); /* 减去导航栏高度 */
  padding: 2rem;
}

.error-content {
  text-align: center;
  max-width: 500px;
}

.error-image {
  max-width: 100%;
  height: auto;
  margin-bottom: 1.5rem;
  border-radius: 8px;
}

.error-title {
  font-size: 2rem;
  font-weight: 600;
  color: #333;
  margin-bottom: 1rem;
}

.error-message {
  font-size: 1rem;
  color: #666;
  margin-bottom: 2rem;
}

.return-button {
  display: inline-block;
  background-color: #2563eb;
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: 0.375rem;
  font-weight: 500;
  text-decoration: none;
  transition: background-color 0.2s;
}

.return-button:hover {
  background-color: #1d4ed8;
}
</style>
