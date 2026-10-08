<template>
  <div class="job-interview-section">
    <div class="interview-header">
      <div class="header-title-box">
        <h3 class="section-heading"><el-icon><Calendar /></el-icon>&nbsp;面试跟进与复盘</h3>
        <span class="sub-tip">共 {{ interviews.length }} 轮面试</span>
      </div>
      <el-button type="primary" size="small" @click="openAddDialog"><el-icon><Plus /></el-icon>&nbsp;添加面试</el-button>
    </div>
    <div v-if="loading" class="loading-state">
      <el-skeleton :rows="3" animated />
    </div>

    <div v-else-if="interviews.length === 0" class="empty-state">
      <el-empty description="暂无面试安排，点击上方按钮预约新面试" :image-size="65">
        <el-button type="primary" plain size="small" @click="openAddDialog">
          <el-icon><Plus /></el-icon>&nbsp;安排第一次面试
        </el-button>
      </el-empty>
    </div>

    <div v-else class="interview-list">
      <div 
        v-for="item in interviews" 
        :key="item.id" 
        class="interview-card"
        :class="{ 'is-upcoming': isUpcoming(item.time), 'is-past': !isUpcoming(item.time) }"
      >
        <div class="card-top">
          <div class="badge-group">
            <span class="round-badge">{{ item.round }}</span>
            <el-tag size="small" :type="getTypeTagType(item.type)" effect="plain">{{ item.type }}</el-tag>
            <span class="status-pill" :class="getTimeStatus(item.time).class">
              {{ getTimeStatus(item.time).text }}
            </span>
          </div>

          <div class="action-buttons">
            <el-tooltip content="导出日历 (.ics)" placement="top">
              <el-button text size="small" type="primary" @click="downloadIcs(item.id)">
                <el-icon><Download /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip content="编辑" placement="top">
              <el-button text size="small" type="info" @click="openEditDialog(item)">
                <el-icon><Edit3 /></el-icon>
              </el-button>
            </el-tooltip>
            <el-popconfirm title="确认删除此面试？" confirm-button-text="删除" cancel-button-text="取消" @confirm="handleDelete(item.id)">
              <template #reference>
                <el-button text size="small" type="danger">
                  <el-icon><Trash2 /></el-icon>
                </el-button>
              </template>
            </el-popconfirm>
          </div>
        </div>

        <div class="time-row">
          <el-icon class="icon-clock"><Clock /></el-icon>
          <span class="interview-time">{{ formatFullDateTime(item.time) }}</span>
          <span class="relative-time">({{ getRelativeTimeDesc(item.time) }})</span>
        </div>

        <div v-if="item.note" class="note-box">
          <div class="note-content">
            <span class="note-label">会议/地点：</span>
            <span class="note-text">{{ item.note }}</span>
          </div>
          <el-button size="small" text type="primary" @click="copyText(item.note, '会议信息已复制')">
            <el-icon><Copy /></el-icon>&nbsp;复制
          </el-button>
        </div>

        <div class="debrief-panel">
          <div class="debrief-header">
            <div class="debrief-title"><el-icon><FileText /></el-icon>&nbsp;面经复盘</div>
            <div class="debrief-actions">
              <el-button v-if="item.debrief" size="small" text type="warning" @click="openSyncQuestionsDialog(item)">
                <el-icon><BookOpen /></el-icon>&nbsp;提取真题到题库
              </el-button>
              <el-button size="small" text type="primary" @click="openEditDialog(item)">
                {{ item.debrief ? '修改复盘' : '+ 填写复盘' }}
              </el-button>
            </div>
          </div>
          <div v-if="item.debrief" class="debrief-body">{{ item.debrief }}</div>
          <div v-else class="debrief-empty">暂未填写面试复盘。面试后建议及时记录考题！</div>
        </div>
      </div>
    </div>
    <!-- 弹窗：新增/编辑面试记录 -->
    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑面试记录' : '新增面试日程'" width="480px" append-to-body destroy-on-close>
      <el-form label-width="90px">
        <el-form-item label="面试轮次" required>
          <el-select v-model="form.round" placeholder="请选择或输入轮次" filterable allow-create style="width: 100%;">
            <el-option label="技术一面" value="一面" />
            <el-option label="技术二面" value="二面" />
            <el-option label="技术三面" value="三面" />
            <el-option label="主管/总监面" value="主管面" />
            <el-option label="HR面" value="HR面" />
            <el-option label="电话初筛" value="电话初筛" />
            <el-option label="终面" value="终面" />
          </el-select>
        </el-form-item>
        <el-form-item label="面试形式" required>
          <el-radio-group v-model="form.type">
            <el-radio-button value="视频">视频会议</el-radio-button>
            <el-radio-button value="电话">电话面试</el-radio-button>
            <el-radio-button value="现场">现场面试</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="面试时间" required>
          <el-date-picker v-model="form.time" type="datetime" placeholder="选择日期与时间" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DDTHH:mm:ss" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="会议/地点">
          <el-input v-model="form.note" placeholder="腾讯会议号、飞书链接、公司地址等" clearable />
        </el-form-item>
        <el-form-item label="面经复盘">
          <el-input v-model="form.debrief" type="textarea" :rows="3" placeholder="考题要点、自我表现、薪资沟通或后续安排..." />
        </el-form-item>
        <el-form-item v-if="!editingId" label="联动状态">
          <el-checkbox v-model="form.syncJobStatus">同步将该职位推向对应面试泳道 (如一面/二面)</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="handleSave">{{ editingId ? '保存更新' : '立即创建' }}</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 弹窗：沉淀真题到题库 -->
    <el-dialog v-model="syncQuestionsDialogVisible" title="📚 一键沉淀面试真题到题库" width="520px" append-to-body destroy-on-close>
      <div style="margin-bottom: 12px; font-size: 13px; color: #64748b;">
        系统将把以下问题存入标准题库（<code>/questions</code>），并打上【{{ currentSyncInterview?.job?.companyName || '实战' }} / {{ currentSyncInterview?.round }}】标签：
      </div>
      <el-form label-position="top">
        <el-form-item label="考察技术领域">
          <el-select v-model="syncDomain" placeholder="选择所属领域" style="width: 100%;">
            <el-option label="前端" value="前端" />
            <el-option label="前端框架" value="前端框架" />
            <el-option label="Java基础" value="Java基础" />
            <el-option label="Spring" value="Spring" />
            <el-option label="数据库" value="数据库" />
            <el-option label="系统设计" value="系统设计" />
            <el-option label="项目经验" value="项目经验" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="面试问题清单 (每行一道题)">
          <el-input v-model="rawQuestionsText" type="textarea" :rows="5" placeholder="每行输入一道面试真题，例如：&#10;1. 为什么 Vue3 选择 Proxy 替代 Object.defineProperty？&#10;2. 谈谈你做过的前端首屏性能优化方案？" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="syncQuestionsDialogVisible = false">取消</el-button>
          <el-button type="warning" :loading="syncingQuestions" @click="handleConfirmSyncQuestions">🚀 确认沉淀入库</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { 
  Calendar, 
  Plus, 
  Clock, 
  Edit3, 
  Trash2, 
  Download, 
  Copy, 
  FileText, 
  BookOpen 
} from 'lucide-vue-next'

const props = defineProps({
  job: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['interview-updated'])

const loading = ref(false)
const interviews = ref([])
const dialogVisible = ref(false)
const editingId = ref(null)
const saving = ref(false)

const form = ref({
  round: '一面',
  type: '视频',
  time: '',
  note: '',
  debrief: '',
  syncJobStatus: true
})

// 提取题库相关
const syncQuestionsDialogVisible = ref(false)
const currentSyncInterview = ref(null)
const syncDomain = ref('前端')
const rawQuestionsText = ref('')
const syncingQuestions = ref(false)

const fetchInterviews = async () => {
  if (!props.job || !props.job.id) return
  loading.value = true
  try {
    const res = await $fetch(`/api/interviews?jobId=${props.job.id}`)
    if (res.success) {
      interviews.value = res.data || []
    } else {
      ElMessage.error(res.error || '获取面试记录失败')
    }
  } catch (err) {
    ElMessage.error('网络异常，获取面试记录失败')
  } finally {
    loading.value = false
  }
}

watch(() => props.job?.id, (newId) => {
  if (newId) {
    fetchInterviews()
  }
}, { immediate: true })
const isUpcoming = (timeStr) => {
  if (!timeStr) return false
  return new Date(timeStr).getTime() >= Date.now()
}

const getTimeStatus = (timeStr) => {
  if (!timeStr) return { text: '时间未定', class: 'neutral' }
  const diff = new Date(timeStr).getTime() - Date.now()
  if (diff > 0) {
    const hours = Math.round(diff / (1000 * 60 * 60))
    if (hours <= 24) {
      return { text: `⚡ 约 ${hours} 小时后`, class: 'urgent' }
    } else {
      const days = Math.round(hours / 24)
      return { text: `🟢 ${days} 天后`, class: 'upcoming' }
    }
  } else {
    return { text: '⚪ 已结束', class: 'past' }
  }
}

const formatFullDateTime = (d) => {
  if (!d) return '-'
  const date = new Date(d)
  if (isNaN(date.getTime())) return String(d)
  const Y = date.getFullYear()
  const M = String(date.getMonth() + 1).padStart(2, '0')
  const D = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${Y}-${M}-${D} ${h}:${m} (${weekDays[date.getDay()]})`
}

const getRelativeTimeDesc = (d) => {
  if (!d) return ''
  const diff = new Date(d).getTime() - Date.now()
  const rtf = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' })
  const days = Math.round(diff / (1000 * 60 * 60 * 24))
  if (Math.abs(days) >= 1) return rtf.format(days, 'day')
  const hours = Math.round(diff / (1000 * 60 * 60))
  return rtf.format(hours, 'hour')
}

const getTypeTagType = (type) => {
  if (type === '电话') return 'warning'
  if (type === '现场') return 'danger'
  return 'primary'
}

const openAddDialog = () => {
  editingId.value = null
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  tomorrow.setHours(10, 0, 0, 0)
  form.value = {
    round: '一面',
    type: '视频',
    time: tomorrow.toISOString().slice(0, 19),
    note: '',
    debrief: '',
    syncJobStatus: true
  }
  dialogVisible.value = true
}

const openEditDialog = (item) => {
  editingId.value = item.id
  form.value = {
    round: item.round || '一面',
    type: item.type || '视频',
    time: item.time ? new Date(item.time).toISOString().slice(0, 19) : '',
    note: item.note || '',
    debrief: item.debrief || '',
    syncJobStatus: false
  }
  dialogVisible.value = true
}

const handleSave = async () => {
  if (!form.value.time) {
    ElMessage.warning('请选择面试时间')
    return
  }
  if (!form.value.round) {
    ElMessage.warning('请输入或选择面试轮次')
    return
  }

  saving.value = true
  try {
    if (editingId.value) {
      const res = await $fetch(`/api/interviews/${editingId.value}`, {
        method: 'PUT',
        body: form.value
      })
      if (res.success) {
        ElMessage.success('更新面试记录成功')
        dialogVisible.value = false
        await fetchInterviews()
        emit('interview-updated')
      } else {
        ElMessage.error(res.error || '更新失败')
      }
    } else {
      const res = await $fetch('/api/interviews', {
        method: 'POST',
        body: {
          ...form.value,
          jobId: props.job.id
        }
      })
      if (res.success) {
        ElMessage.success('已添加面试日程')
        dialogVisible.value = false
        await fetchInterviews()
        emit('interview-updated')
      } else {
        ElMessage.error(res.error || '创建失败')
      }
    }
  } catch (err) {
    ElMessage.error('操作失败: ' + err.message)
  } finally {
    saving.value = false
  }
}

const handleDelete = async (id) => {
  try {
    const res = await $fetch(`/api/interviews/${id}`, { method: 'DELETE' })
    if (res.success) {
      ElMessage.success('面试记录已删除')
      await fetchInterviews()
      emit('interview-updated')
    } else {
      ElMessage.error(res.error || '删除失败')
    }
  } catch (err) {
    ElMessage.error('删除异常: ' + err.message)
  }
}

const downloadIcs = (id) => {
  window.open(`/api/interviews/${id}/ics`, '_blank')
}

const copyText = async (text, successMsg = '已复制') => {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(successMsg)
  } catch (err) {
    ElMessage.error('复制失败')
  }
}

const openSyncQuestionsDialog = (item) => {
  currentSyncInterview.value = item
  if (item.debrief) {
    const lines = item.debrief.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 5)
    rawQuestionsText.value = lines.join('\n')
  } else {
    rawQuestionsText.value = ''
  }
  syncQuestionsDialogVisible.value = true
}

const handleConfirmSyncQuestions = async () => {
  if (!rawQuestionsText.value.trim()) {
    ElMessage.warning('请输入待沉淀的问题')
    return
  }

  const lines = rawQuestionsText.value
    .split('\n')
    .map(l => l.replace(/^(\d+[\.\、\s]+|[Q|q]\d+[\:\：\s]+)/, '').trim())
    .filter(Boolean)

  if (lines.length === 0) {
    ElMessage.warning('未能解析出有效问题')
    return
  }

  syncingQuestions.value = true
  try {
    const questions = lines.map(title => ({
      title,
      domain: syncDomain.value,
      categoryTags: `${currentSyncInterview.value?.job?.companyName || '实战'}/${currentSyncInterview.value?.round || '一面'}`
    }))

    const res = await $fetch(`/api/interviews/${currentSyncInterview.value.id}/sync-to-questions`, {
      method: 'POST',
      body: { questions }
    })

    if (res.success) {
      ElMessage.success(`🎉 成功同步 ${res.count} 道真题至标准题库！`)
      syncQuestionsDialogVisible.value = false
    } else {
      ElMessage.error(res.error || '同步题库失败')
    }
  } catch (err) {
    ElMessage.error('同步失败: ' + err.message)
  } finally {
    syncingQuestions.value = false
  }
}

defineExpose({
  fetchInterviews,
  openAddDialog
})
</script>

<style scoped>
.job-interview-section {
  padding: 12px 16px;
}

.interview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid #f1f5f9;
}

.section-heading {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  display: inline-flex;
  align-items: center;
}

.sub-tip {
  font-size: 12px;
  color: #94a3b8;
  margin-left: 8px;
}

.empty-state {
  padding: 24px 0;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px dashed #cbd5e1;
}

.interview-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.interview-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 14px;
  transition: all 0.2s ease;
}

.interview-card.is-upcoming {
  border-left: 4px solid #3b82f6;
  box-shadow: 0 2px 6px rgba(59, 130, 246, 0.05);
}

.interview-card.is-past {
  border-left: 4px solid #94a3b8;
  opacity: 0.92;
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.badge-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.round-badge {
  font-weight: 700;
  font-size: 14px;
  color: #0f172a;
}

.status-pill {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 10px;
}

.status-pill.urgent {
  background: #fef2f2;
  color: #ef4444;
  border: 1px solid #fecaca;
}

.status-pill.upcoming {
  background: #eff6ff;
  color: #3b82f6;
  border: 1px solid #bfdbfe;
}

.status-pill.past {
  background: #f1f5f9;
  color: #64748b;
}

.time-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #334155;
  margin-bottom: 8px;
}

.icon-clock {
  color: #3b82f6;
}

.interview-time {
  font-weight: 600;
}

.relative-time {
  color: #64748b;
  font-size: 12px;
}

.note-box {
  background: #f8fafc;
  border-radius: 6px;
  padding: 6px 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  margin-bottom: 10px;
  border: 1px solid #e2e8f0;
}

.note-label {
  color: #64748b;
}

.note-text {
  color: #1e293b;
  word-break: break-all;
}

.debrief-panel {
  background: #fafafa;
  border-top: 1px dashed #e2e8f0;
  padding-top: 8px;
  margin-top: 6px;
}

.debrief-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.debrief-title {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  display: flex;
  align-items: center;
}

.debrief-body {
  background: #ffffff;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 12px;
  color: #334155;
  line-height: 1.6;
  white-space: pre-wrap;
  border-left: 3px solid #f59e0b;
}

.debrief-empty {
  font-size: 12px;
  color: #94a3b8;
  font-style: italic;
}
</style>
