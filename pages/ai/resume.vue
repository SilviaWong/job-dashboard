<template>
  <div class="mac-container" style="height: calc(100vh - 100px); padding: 20px; box-sizing: border-box;">
    <div style="background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.04); padding: 32px; display: flex; flex-direction: column; height: 100%; box-sizing: border-box;">
      <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 24px;">
        <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(52, 199, 89, 0.1); color: #34C759; display: flex; align-items: center; justify-content: center;">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </div>
        <div>
          <h2 style="margin: 0 0 4px 0; font-size: 24px; color: #333;">简历管理</h2>
          <p style="margin: 0; color: #666; font-size: 14px;">你的简历内容将用于 AI 匹配度打分和生成个性化打招呼语。请确保信息准确完整。</p>
        </div>
      </div>

      <div style="flex: 1; min-height: 0; margin-bottom: 16px;">
        <textarea 
          class="resume-editor" 
          v-model="resumeText" 
          placeholder="在此处粘贴或编辑你的简历内容...&#10;&#10;建议包含：教育经历、工作经历、项目经验、技能特长等。"
        ></textarea>
      </div>

      <p style="margin: 0 0 24px 0; font-size: 13px; color: #86868B;">
        使用建议：请确保简历信息真实、详细，包含与目标岗位相关的技能和经验，这将有助于 AI 更准确地进行评分。
      </p>

      <div style="display: flex; justify-content: flex-end;">
        <button class="btn-save btn-primary" @click="saveSettings" :disabled="loading">
          {{ loading ? '保存中...' : '保存简历' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

const loading = ref(false)
const resumeText = ref('')

const fetchSettings = async () => {
  try {
    const res = await $fetch('/api/settings/ai')
    if (res.success) {
      resumeText.value = res.data.resume || ''
    }
  } catch (error) {
    ElMessage.error('获取简历失败')
  }
}

const saveSettings = async () => {
  loading.value = true
  try {
    const res = await $fetch('/api/settings/ai', {
      method: 'POST',
      body: {
        resume: resumeText.value
      }
    })
    if (res.success) {
      ElMessage.success('简历保存成功')
    } else {
      ElMessage.error('保存失败: ' + res.error)
    }
  } catch (error) {
    ElMessage.error('请求失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchSettings()
})
</script>

<style scoped>
.mac-container {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Inter", sans-serif;
  background-color: #F5F5F7;
}

.resume-editor {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: #FAFAFA;
  font-size: 14px;
  color: #1D1D1F;
  resize: none;
  font-family: inherit;
  line-height: 1.6;
  transition: all 0.2s;
}

.resume-editor:focus {
  background: #FFFFFF;
  border-color: #34C759;
  box-shadow: 0 0 0 3px rgba(52, 199, 89, 0.1);
  outline: none;
}

.btn-primary {
  padding: 12px 32px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  background: #007AFF;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
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
</style>
