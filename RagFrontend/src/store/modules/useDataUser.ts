import { defineStore } from 'pinia'
import { get, post } from '@/utils/ASFaxios'
import { Dialog, MessagePlugin } from 'tdesign-vue-next'

export const useDataUserStore = defineStore('dataUser', {
  state: () => {
    return {
      userData: {
        name: '未知',
        avatar:
          'https://avatars.githubusercontent.com/u/145737758?s=400&u=90eecb2edb0caf7cea2cd073d75270cbaa155cdf&v=4',
        signature: '未知', // 修正字段名保持一致
        email: '', // 添加 email 字段
        social_media: '' // 添加 social_media 字段
      }
    }
  },

  actions: {
    async fetchUserData() {
      try {
        const response = await get<any>('/api/user/GetUserData')
        this.userData = response.data
        console.log('API Response:', response.data)
      } catch (error) {
        MessagePlugin.error('获取用户数据失败！')
      }
    },
    async updateUserData(name: string, avatar: string, signature: string) {
      // 修改参数名保持一致
      try {
        const data = new FormData()
        data.append('name', name)
        data.append('avatar', avatar)
        data.append('signature', signature) // 修改字段名保持一致
        data.append('email', this.userData.email) // 添加 email 字段
        data.append('social_media', this.userData.social_media) // 添加 social_media 字段
        console.log('FormData:', data) // 更好的方式来查看FormData内容
        const response = await post<any>('/api/UpdateUserData', data)
        MessagePlugin.success('更新用户数据成功！')
        this.userData = response.data
        console.log('API Response:', response.data)
        // 触发整个页面的刷新

        window.location.reload()
      } catch (error) {
        MessagePlugin.error('更新用户数据失败！')
      }
    }
  }
})
