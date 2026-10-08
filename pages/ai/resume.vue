<template>
  <div class="mac-container" style="height: calc(100vh - 100px); padding: 20px; box-sizing: border-box;">
    <div class="resume-workspace">
      <!-- 左侧：多版本简历画像侧边栏 -->
      <ResumeProfileSidebar
        :profiles="profiles"
        :current-id="currentProfile?.id"
        :loading="loading"
        @select="selectProfile"
        @create="handleCreateProfile"
      />

      <!-- 右侧：当前选中简历的元数据与正文编辑面板 -->
      <ResumeEditorPanel
        :profile="currentProfile"
        :total-count="profiles.length"
        :saving="saving"
        @save="handleSaveProfile"
        @duplicate="handleDuplicateProfile"
        @delete="handleDeleteProfile"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import ResumeProfileSidebar from '~/components/ResumeProfileSidebar.vue'
import ResumeEditorPanel from '~/components/ResumeEditorPanel.vue'

const loading = ref(false)
const saving = ref(false)
const profiles = ref([])
const currentProfile = ref(null)

const fetchProfiles = async (targetId = null) => {
  loading.value = true
  try {
    const res = await $fetch('/api/resumes')
    if (res.success) {
      profiles.value = res.data || []
      if (profiles.value.length > 0) {
        if (targetId) {
          const found = profiles.value.find(p => p.id === targetId)
          selectProfile(found || profiles.value[0])
        } else if (!currentProfile.value) {
          const defaultOne = profiles.value.find(p => p.isDefault) || profiles.value[0]
          selectProfile(defaultOne)
        } else {
          const found = profiles.value.find(p => p.id === currentProfile.value.id)
          selectProfile(found || profiles.value[0])
        }
      } else {
        currentProfile.value = null
      }
    } else {
      ElMessage.error(res.error || '获取简历列表失败')
    }
  } catch (err) {
    ElMessage.error('网络请求失败')
  } finally {
    loading.value = false
  }
}

const selectProfile = (p) => {
  currentProfile.value = p
}

const handleSaveProfile = async (formData) => {
  if (!formData.title?.trim()) {
    ElMessage.warning('请输入简历画像名称')
    return
  }
  if (!formData.content?.trim()) {
    ElMessage.warning('请输入简历正文内容')
    return
  }

  saving.value = true
  try {
    const res = await $fetch(`/api/resumes/${formData.id}`, {
      method: 'PUT',
      body: {
        title: formData.title,
        targetRole: formData.targetRole,
        tags: formData.tags,
        content: formData.content,
        isDefault: formData.isDefault
      }
    })

    if (res.success) {
      ElMessage.success('简历画像保存成功')
      await fetchProfiles(formData.id)
    } else {
      ElMessage.error(res.error || '保存失败')
    }
  } catch (err) {
    ElMessage.error('保存请求异常')
  } finally {
    saving.value = false
  }
}

const handleCreateProfile = async () => {
  try {
    const { value: title } = await ElMessageBox.prompt(
      '请输入新简历画像名称 (如: Java后端 / 全栈工程师 / 金融微服务方向)',
      '新建简历画像版本',
      {
        confirmButtonText: '确定创建',
        cancelButtonText: '取消',
        inputPattern: /.+/,
        inputErrorMessage: '简历名称不能为空'
      }
    )

    if (!title || !title.trim()) return

    saving.value = true
    const baseContent = currentProfile.value?.content || '个人简介\n...'
    const res = await $fetch('/api/resumes', {
      method: 'POST',
      body: {
        title: title.trim(),
        targetRole: currentProfile.value?.targetRole || '开发工程师',
        tags: ['新版本'],
        content: baseContent,
        isDefault: false
      }
    })

    if (res.success) {
      ElMessage.success('新建简历版本成功')
      await fetchProfiles(res.data.id)
    } else {
      ElMessage.error(res.error || '创建失败')
    }
  } catch (err) {
    // 用户取消 prompt
  } finally {
    saving.value = false
  }
}

const handleDuplicateProfile = async (target) => {
  if (!target) return
  saving.value = true
  try {
    const newTitle = `${target.title} (副本)`
    const res = await $fetch('/api/resumes', {
      method: 'POST',
      body: {
        title: newTitle,
        targetRole: target.targetRole,
        tags: [...(target.tags || [])],
        content: target.content,
        isDefault: false
      }
    })

    if (res.success) {
      ElMessage.success('副本已创建')
      await fetchProfiles(res.data.id)
    } else {
      ElMessage.error(res.error || '复制失败')
    }
  } catch (err) {
    ElMessage.error('复制异常')
  } finally {
    saving.value = false
  }
}

const handleDeleteProfile = async (target) => {
  if (!target) return
  try {
    await ElMessageBox.confirm(
      `确定要删除简历画像「${target.title}」吗？此操作无法恢复。`,
      '删除确认',
      {
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    saving.value = true
    const res = await $fetch(`/api/resumes/${target.id}`, {
      method: 'DELETE'
    })

    if (res.success) {
      ElMessage.success('简历版本已删除')
      await fetchProfiles()
    } else {
      ElMessage.error(res.error || '删除失败')
    }
  } catch (err) {
    // 取消删除
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  fetchProfiles()
})
</script>

<style scoped>
.mac-container {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Inter", sans-serif;
  background-color: #F5F5F7;
}

.resume-workspace {
  display: flex;
  gap: 16px;
  height: 100%;
}
</style>
