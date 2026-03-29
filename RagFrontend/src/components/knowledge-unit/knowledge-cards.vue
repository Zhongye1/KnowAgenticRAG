<template>
  <t-card :title="props.card.title" :description="props.card.description" @click="handleClick">
    <!-- 使用 cover 插槽来自定义封面 -->
    <template #cover>
      <img :src="props.card.cover" class="knowledge-card-image" />
    </template>

    <template #avatar>
      <t-avatar :image="displayAvatar" size="56px"></t-avatar>
    </template>

    <template #actions>
      <t-dropdown :options="options" :min-column-width="112" @click="clickHandler">
        <div class="tdesign-demo-dropdown-trigger">
          <t-button variant="text" shape="square" @click.stop>
            <more-icon />
          </t-button>
        </div>
      </t-dropdown>
    </template>

    <template #footer>
      <div class="knowledge-card-footer-buttonlists" @click.stop>
        <t-button
          variant="text"
          shape="square"
          :style="{ 'margin-right': '8px', backgroundColor: HertIconColor }"
          @click.stop="handleClickHeartIcon"
        >
          <heart-icon />
        </t-button>
        <t-button variant="text" shape="square" :style="{ 'margin-right': '8px' }">
          <chat-icon />
        </t-button>
        <t-button variant="text" shape="square">
          <share-icon />
        </t-button>
      </div>
      <div class="created-time">Created at: {{ props.card.createdTime }}</div>
    </template>
  </t-card>
</template>

<script lang="ts" setup>
import { MessagePlugin, DropdownProps } from 'tdesign-vue-next'
import { HeartIcon, ChatIcon, ShareIcon, MoreIcon } from 'tdesign-icons-vue-next'
import { ref, computed } from 'vue'
import { useCardDataStore } from '@/store'
import axios from 'axios'
import { useDataUserStore } from '@/store/modules/useDataUser'

import API_ENDPOINTS from '@/utils/apiConfig'

interface Card {
  id: string
  title: string
  avatar: string
  description: string
  cover: string
  createdTime: string
}

const cardDataStore = useCardDataStore()

const options: DropdownProps['options'] = [
  {
    content: '删除',
    value: 1
  },
  {
    content: '选项',
    value: 2
  }
]

const props = defineProps<{
  card: Card
  goToDetail: Function
}>()

// 使用与Header组件相同的头像处理逻辑
const displayAvatar = computed(() => {
  const userStore = useDataUserStore()

  // 如果用户数据还未加载，返回默认头像
  if (!userStore.userData) {
    console.log('用户头像数据未加载')
    return 'https://tdesign.gtimg.com/site/avatar.jpg'
  }

  const avatar = userStore.userData?.avatar || props.card.avatar || ''
  if (avatar && avatar.startsWith('/static/')) {
    return API_ENDPOINTS.USER.AVATAR(avatar)
  }
  return avatar || 'https://tdesign.gtimg.com/site/avatar.jpg'
})

const handleClick = () => {
  // 调用父组件传递的 goToDetail 方法
  //MessagePlugin.success("点击了卡片");
}

const clickHandler: DropdownProps['onClick'] = async data => {
  // 处理下拉菜单点击事件
  if (data.value === 1) {
    // 删除操作
    try {
      const klbId = props.card.id
      const response = await axios.delete(`/api/delete-knowledgebase/${klbId}`)

      // 请求成功后才显示成功消息
      if (response.status === 200) {
        MessagePlugin.success(`知识库【${props.card.title}】删除成功`)
        // 删除成功后，更新本地存储
        //cardDataStore.deleteCard(klbId);
        await cardDataStore.fetchCards()
      }
    } catch (error) {
      // 处理错误
      MessagePlugin.error(`删除知识库失败: ${error}`)
      console.error('删除知识库失败:', error)
    }
  } else if (data.value === 2) {
    // 其他操作
    MessagePlugin.info('其他操作未实现')
  }
}

const HertIconColor = ref<string>('') // 心形图标颜色

// 点击卡片图标时触发
const handleClickHeartIcon = (e: Event) => {
  e.stopPropagation()
  HertIconColor.value = HertIconColor.value === '' ? '#d90026' : ''
  // 这里可以添加其他逻辑，比如发送请求到后端保存状态等
  //这个颜色要修改到适合的，最好不要写死在这里
}
</script>

<style scoped>
.knowledge-card-footer-buttonlists {
  display: flex;
  justify-content: space-between;
  width: 30%;
  transition: background-color 0.3s ease;
  border-radius: 3px;
}

.knowledge-card-footer-buttonlists:hover {
  background-color: #f3f3f37e;
  /* 悬停时的背景色 */
}

.knowledge-card-image {
  width: 100%;
  height: 200px;
  object-fit: cover;
  /* 超出部分进行裁剪 */
}

.created-time {
  margin-top: 8px;
  font-size: 12px;
  color: #888;
}
</style>
