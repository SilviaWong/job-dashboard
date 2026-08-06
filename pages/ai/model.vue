<template>
  <div class="mac-container" style="height: calc(100vh - 100px); padding: 20px; box-sizing: border-box;">
    <div style="display: flex; height: 100%; gap: 0; background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.04); overflow: hidden;">

      <!-- 左侧：模型配置列表 -->
      <div style="width: 250px; background: #fcfcfc; border-right: 1px solid #f0f0f0; display: flex; flex-direction: column;">
        <div style="padding: 16px; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; font-size: 16px; color: #333; font-weight: 600;">模型平台</h3>
          <button @click="addProfile" style="background: transparent; border: none; font-size: 20px; color: #007bff; cursor: pointer; padding: 0 4px; display: flex; align-items: center; justify-content: center;" title="新增平台配置">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
        <div style="flex: 1; overflow-y: auto; padding: 8px;">
          <div 
            v-for="profile in profiles" 
            :key="profile.id"
            @click="selectProfile(profile.id)"
            class="profile-item"
            :class="{ 'is-active': activeProfileId === profile.id }"
          >
            {{ profile.name || '未命名配置' }}
          </div>
        </div>
      </div>

      <!-- 右侧：当前选中的模型配置表单 -->
      <div style="flex: 1; padding: 32px; overflow-y: auto; display: flex; flex-direction: column;">
        <template v-if="activeProfile">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
            <div>
              <h2 style="margin: 0 0 8px 0; font-size: 24px; color: #333;">配置详情</h2>
              <p style="margin: 0; color: #666; font-size: 14px;">配置兼容 OpenAI 格式的 API 接口，支持多平台切换使用。</p>
            </div>
            <button v-if="profiles.length > 1" @click="deleteProfile(activeProfile.id)" style="background: transparent; border: 1px solid #dc3545; color: #dc3545; border-radius: 6px; padding: 6px 16px; cursor: pointer; font-size: 13px;">删除此配置</button>
          </div>

          <div class="config-form" style="max-width: 600px;">
            <div class="input-group">
              <label class="input-label">配置名称</label>
              <input type="text" class="api-input" v-model="activeProfile.name" placeholder="例如: DeepSeek, 阿里通义千问, 本地模型">
            </div>
            <div class="input-group">
              <label class="input-label">API Base URL</label>
              <input type="text" class="api-input" v-model="activeProfile.url" placeholder="https://api.deepseek.com/v1">
            </div>
            <div class="input-group">
              <label class="input-label">模型名称</label>
              <input type="text" class="api-input" v-model="activeProfile.model" placeholder="deepseek-chat">
            </div>
            <div class="input-group">
              <label class="input-label">API Key</label>
              <input type="password" class="api-input" v-model="activeProfile.key" placeholder="sk-...">
            </div>
          </div>

          <div style="margin-top: 32px; display: flex; gap: 12px; max-width: 600px;">
            <button @click="testConnection" :disabled="testing" class="btn-test" style="flex: 1; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-weight: 500; cursor: pointer; background: #fff; color: #333; transition: all 0.2s;">
              {{ testing ? '测试中...' : '测试连接' }}
            </button>
            <button @click="saveSettings" :disabled="loading" class="btn-primary">
              {{ loading ? '保存中...' : '保存配置' }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const loading = ref(false)
const testing = ref(false)
const activeProfileId = ref('1')
const profiles = ref([])

const activeProfile = computed(() => {
  return profiles.value.find(p => p.id === activeProfileId.value)
})

const fetchSettings = async () => {
  try {
    const res = await $fetch('/api/settings/ai')
    if (res.success) {
      profiles.value = res.data.profiles || []
      activeProfileId.value = res.data.activeProfileId || 'default'
      if (profiles.value.length === 0) {
        addProfile()
      }
    }
  } catch (error) {
    ElMessage.error('获取配置失败')
  }
}

const saveSettings = async () => {
  loading.value = true
  try {
    const res = await $fetch('/api/settings/ai', {
      method: 'POST',
      body: {
        activeProfileId: activeProfileId.value,
        profiles: profiles.value
      }
    })
    if (res.success) {
      ElMessage.success('保存成功')
    } else {
      ElMessage.error('保存失败: ' + res.error)
    }
  } catch (error) {
    ElMessage.error('请求失败')
  } finally {
    loading.value = false
  }
}

const testConnection = async () => {
  if (!activeProfile.value.url || !activeProfile.value.key || !activeProfile.value.model) {
    ElMessage.warning('请填写完整的 API URL、API Key 和模型名称！')
    return
  }

  testing.value = true
  try {
    const res = await $fetch('/api/settings/ai-test', {
      method: 'POST',
      body: {
        url: activeProfile.value.url,
        key: activeProfile.value.key,
        model: activeProfile.value.model
      }
    })
    
    if (res.success) {
      ElMessage.success('连接成功！API 配置正确。')
    } else {
      ElMessage.error(`请求失败: ${res.error}`)
    }
  } catch (error) {
    ElMessage.error('测试请求失败')
  } finally {
    testing.value = false
  }
}

const addProfile = () => {
  const newId = Date.now().toString()
  profiles.value.push({
    id: newId,
    name: '新配置',
    url: '',
    model: '',
    key: ''
  })
  activeProfileId.value = newId
}

const selectProfile = (index) => {
  activeProfileId.value = index
}

const deleteProfile = (id) => {
  if (profiles.value.length <= 1) return
  ElMessageBox.confirm('确定要删除这个配置吗?', '警告', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    profiles.value = profiles.value.filter(p => p.id !== id)
    if (activeProfileId.value === id) {
      activeProfileId.value = profiles.value[0].id
    }
  }).catch(() => {})
}

onMounted(() => {
  fetchSettings()
})
</script>

<style scoped>
.mac-container {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Inter", sans-serif;
}

.profile-item {
  padding: 10px 12px;
  margin-bottom: 4px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  color: #1D1D1F;
  font-weight: 500;
  transition: background-color 0.2s, color 0.2s;
}

.profile-item:hover {
  background-color: rgba(0, 0, 0, 0.04);
}

.profile-item.is-active {
  background-color: #007AFF;
  color: #fff;
}

.input-group {
  margin-bottom: 16px;
}

.input-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #86868B;
  margin-bottom: 8px;
}

.api-input {
  width: 100%;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: #FFFFFF;
  font-size: 14px;
  color: #1D1D1F;
  transition: all 0.2s;
  box-sizing: border-box;
}

.api-input:focus {
  border-color: #007AFF;
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
  outline: none;
}

.btn-primary {
  background-color: #007AFF;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 12px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  flex: 1;
}

.btn-primary:hover {
  background-color: #0066CC;
  transform: translateY(-1px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.08);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-test:hover {
  background: #f8f9fa !important;
}

.btn-test:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
