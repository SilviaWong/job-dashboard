<template>
  <div class="interview-hub-page">
    <!-- 顶部标题与快速统计卡片 -->
    <div class="hub-header">
      <div class="header-main">
        <div>
          <h1 class="page-title">
            <el-icon class="title-icon"><Calendar /></el-icon>
            面试日程与实战复盘
          </h1>
          <p class="page-subtitle">
            全流程日程追踪、智能倒计时、一键同步手机/电脑日历 (.ics) 与面经真题沉淀
          </p>
        </div>
        <div class="header-actions">
          <el-button type="default" @click="exportAllIcs">
            <el-icon><Download /></el-icon>&nbsp;导出日历订阅 (.ics)
          </el-button>
          <el-button type="primary" @click="openCreateDialog">
            <el-icon><Plus /></el-icon>&nbsp;安排新面试
          </el-button>
        </div>
      </div>

      <!-- 统计指标卡 -->
      <div class="stats-row">
        <div class="stat-card" :class="{ 'is-active': activeFilter === 'upcoming' }" @click="setFilter('upcoming')">
          <div class="stat-content">
            <div class="stat-num text-primary">{{ stats.upcoming }}</div>
            <div class="stat-label">即将开始 (待面试)</div>
          </div>
          <div class="stat-icon-wrap bg-blue-50 text-blue-600">
            <el-icon :size="22"><Clock /></el-icon>
          </div>
        </div>

        <div class="stat-card" :class="{ 'is-active': activeFilter === 'today' }" @click="setFilter('today')">
          <div class="stat-content">
            <div class="stat-num text-warning">{{ stats.today }}</div>
            <div class="stat-label">今日面试</div>
          </div>
          <div class="stat-icon-wrap bg-amber-50 text-amber-600">
            <el-icon :size="22"><Bell /></el-icon>
          </div>
        </div>

        <div class="stat-card" @click="setFilter('all')">
          <div class="stat-content">
            <div class="stat-num text-success">{{ stats.debriefed }}</div>
            <div class="stat-label">已沉淀面经复盘</div>
          </div>
          <div class="stat-icon-wrap bg-emerald-50 text-emerald-600">
            <el-icon :size="22"><CheckCircle2 /></el-icon>
          </div>
        </div>

        <div class="stat-card" :class="{ 'is-active': activeFilter === 'all' }" @click="setFilter('all')">
          <div class="stat-content">
            <div class="stat-num text-slate">{{ stats.total }}</div>
            <div class="stat-label">总记录场次</div>
          </div>
          <div class="stat-icon-wrap bg-slate-50 text-slate-600">
            <el-icon :size="22"><Calendar /></el-icon>
          </div>
        </div>
      </div>
    </div>

    <!-- 筛选和搜索栏 -->
    <div class="hub-filter-bar">
      <el-radio-group v-model="activeFilter" @change="onFilterChange" size="default">
        <el-radio-button label="all">全部场次 ({{ stats.total }})</el-radio-button>
        <el-radio-button label="upcoming">待参加 ({{ stats.upcoming }})</el-radio-button>
        <el-radio-button label="today">今日面试 ({{ stats.today }})</el-radio-button>
        <el-radio-button label="past">历史记录</el-radio-button>
      </el-radio-group>

      <div class="filter-search-box">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索公司、岗位、轮次、笔记或复盘..."
          clearable
          @input="handleSearch"
          style="width: 320px;"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
      </div>
    </div>
    <!-- 面试列表区域 -->
    <div class="hub-list-container">
      <div v-if="loading" class="loading-state">
        <el-skeleton :rows="5" animated />
      </div>

      <div v-else-if="interviews.length === 0" class="empty-state">
        <el-empty description="暂无符合条件的面试记录" :image-size="80">
          <el-button type="primary" @click="openCreateDialog">
            <el-icon><Plus /></el-icon>&nbsp;立即安排新面试
          </el-button>
        </el-empty>
      </div>

      <div v-else class="interview-cards-grid">
        <div 
          v-for="item in interviews" 
          :key="item.id" 
          class="hub-interview-card"
          :class="{ 'is-upcoming': isUpcoming(item.time), 'is-today': isToday(item.time) }"
        >
          <!-- 卡片头部：职位与公司基本信息 -->
          <div class="card-header">
            <div class="header-left">
              <div class="company-badge-box">
                <span class="company-name">{{ item.job?.companyFullName || item.job?.companyName || '目标企业' }}</span>
                <el-tag size="small" type="info" effect="plain" class="platform-tag">
                  {{ item.job?.platform || '招聘平台' }}
                </el-tag>
              </div>
              <div class="job-sub-row">
                <span class="job-title-text" @click="openJobDrawer(item.job)">
                  {{ item.job?.title || '未关联职位' }}
                </span>
                <span v-if="item.job?.salary" class="job-salary-text">{{ item.job.salary }}</span>
                <span v-if="item.job?.location" class="job-loc-text">· {{ item.job.location }}</span>
              </div>
            </div>

            <div class="header-right">
              <span class="status-pill" :class="getTimeStatus(item.time).class">
                {{ getTimeStatus(item.time).text }}
              </span>
              <div class="card-quick-actions">
                <el-tooltip content="导出日历 (.ics)" placement="top">
                  <el-button text size="small" type="primary" @click="downloadIcs(item.id)">
                    <el-icon><Download /></el-icon>
                  </el-button>
                </el-tooltip>
                <el-tooltip content="查看岗位详情" placement="top">
                  <el-button text size="small" type="primary" @click="openJobDrawer(item.job)">
                    <el-icon><ExternalLink /></el-icon>
                  </el-button>
                </el-tooltip>
                <el-tooltip content="编辑日程" placement="top">
                  <el-button text size="small" type="info" @click="openEditDialog(item)">
                    <el-icon><Edit3 /></el-icon>
                  </el-button>
                </el-tooltip>
                <el-popconfirm title="确认删除此面试记录？" confirm-button-text="删除" cancel-button-text="取消" @confirm="handleDelete(item.id)">
                  <template #reference>
                    <el-button text size="small" type="danger">
                      <el-icon><Trash2 /></el-icon>
                    </el-button>
                  </template>
                </el-popconfirm>
              </div>
            </div>
          </div>

          <!-- 面试形式、轮次与精准时间 -->
          <div class="card-meta-row">
            <div class="meta-tags">
              <span class="round-chip">{{ item.round }}</span>
              <el-tag size="small" :type="getTypeTagType(item.type)" effect="light">
                <component :is="getTypeIcon(item.type)" :size="12" style="margin-right: 3px; vertical-align: -2px;" />
                {{ item.type }}
              </el-tag>
            </div>
            <div class="meta-time">
              <el-icon class="time-icon"><Clock /></el-icon>
              <span class="time-bold">{{ formatFullDateTime(item.time) }}</span>
              <span class="time-relative">({{ getRelativeTimeDesc(item.time) }})</span>
            </div>
          </div>

          <!-- 会议信息与地点 -->
          <div v-if="item.note" class="card-note-bar">
            <span class="note-label">会议/地点：</span>
            <span class="note-body">{{ item.note }}</span>
            <el-button text size="small" type="primary" @click="copyText(item.note, '会议信息已复制')">
              <el-icon><Copy /></el-icon>&nbsp;复制
            </el-button>
          </div>

          <!-- 面经与复盘板块 -->
          <div class="card-debrief-container">
            <div class="debrief-bar-header">
              <span class="debrief-heading">
                <el-icon><FileText /></el-icon>&nbsp;实战面经与复盘
              </span>
              <div class="debrief-head-actions">
                <el-button 
                  v-if="item.debrief" 
                  text 
                  size="small" 
                  type="warning" 
                  @click="openSyncQuestionsDialog(item)"
                >
                  <el-icon><BookOpen /></el-icon>&nbsp;沉淀真题到题库
                </el-button>
                <el-button text size="small" type="primary" @click="openEditDialog(item)">
                  {{ item.debrief ? '编辑复盘' : '+ 填写复盘' }}
                </el-button>
              </div>
            </div>

            <div v-if="item.debrief" class="debrief-content-box">
              <p class="debrief-paragraph">{{ item.debrief }}</p>
            </div>
            <div v-else class="debrief-empty-box" @click="openEditDialog(item)">
              <span>✍️ 暂未填写复盘。面试后建议及时记录面试官考点，提升后续面经复用率！</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 分页栏 -->
      <div v-if="pagination.total > pagination.pageSize" class="hub-pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          :page-size="pagination.pageSize"
          :total="pagination.total"
          layout="prev, pager, next, total"
          @current-change="onPageChange"
        />
      </div>
    </div>
    <!-- 弹窗：安排/编辑面试日程 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑面试日程' : '安排新面试'"
      width="520px"
      append-to-body
      destroy-on-close
    >
      <el-form label-width="90px">
        <el-form-item v-if="!editingId" label="关联职位" required>
          <el-select
            v-model="form.jobId"
            filterable
            remote
            reserve-keyword
            placeholder="搜索职位名称或公司名称"
            :remote-method="searchJobs"
            :loading="searchingJobs"
            style="width: 100%;"
          >
            <el-option
              v-for="job in jobOptions"
              :key="job.id"
              :label="`${job.title} - ${job.companyFullName || job.companyName} (${job.salary || '薪资面议'})`"
              :value="job.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="面试轮次" required>
          <el-select v-model="form.round" placeholder="请选择或输入面试轮次" filterable allow-create style="width: 100%;">
            <el-option label="技术一面" value="一面" />
            <el-option label="技术二面" value="二面" />
            <el-option label="技术三面" value="三面" />
            <el-option label="主管/总监面" value="主管面" />
            <el-option label="HR面" value="HR面" />
            <el-option label="电话初筛" value="电话初筛" />
            <el-option label="业务终面" value="终面" />
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
          <el-date-picker
            v-model="form.time"
            type="datetime"
            placeholder="选择面试日期与时间"
            format="YYYY-MM-DD HH:mm"
            value-format="YYYY-MM-DDTHH:mm:ss"
            style="width: 100%;"
          />
        </el-form-item>

        <el-form-item label="会议/地点">
          <el-input 
            v-model="form.note" 
            placeholder="例如: 腾讯会议号 123-456-789、飞书链接、公司详细地址等" 
            clearable 
          />
        </el-form-item>

        <el-form-item label="面经复盘">
          <el-input
            v-model="form.debrief"
            type="textarea"
            :rows="4"
            placeholder="记录面试官提出的考题、自我发挥、薪资预期沟通或后续安排..."
          />
        </el-form-item>

        <el-form-item v-if="!editingId" label="联动状态">
          <el-checkbox v-model="form.syncJobStatus">
            同步将职位看板状态更新为对应面试泳道
          </el-checkbox>
        </el-form-item>
      </el-form>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="handleSave">
            {{ editingId ? '保存修改' : '确认创建' }}
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 弹窗：真题沉淀入题库 -->
    <el-dialog
      v-model="syncQuestionsDialogVisible"
      title="📚 一键沉淀实战真题到题库"
      width="540px"
      append-to-body
      destroy-on-close
    >
      <div style="margin-bottom: 14px; font-size: 13px; color: #64748b;">
        系统将把以下问题存入标准题库（<code>/questions</code>），并打上【{{ currentSyncInterview?.job?.companyName || '实战' }} / {{ currentSyncInterview?.round }}】真题标签：
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
          <el-input
            v-model="rawQuestionsText"
            type="textarea"
            :rows="6"
            placeholder="每行输入一道面试真题，例如：&#10;1. 为什么 Vue3 选择 Proxy 替代 Object.defineProperty？&#10;2. 谈谈你做过的前端首屏加载与性能优化方案？"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="syncQuestionsDialogVisible = false">取消</el-button>
          <el-button type="warning" :loading="syncingQuestions" @click="handleConfirmSyncQuestions">
            🚀 确认入库
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 职位详情抽屉 -->
    <JobDetailDrawer ref="jobDrawerRef" @status-changed="fetchInterviews" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { 
  Calendar, 
  Clock, 
  Bell, 
  CheckCircle2, 
  Download, 
  Plus, 
  Search, 
  ExternalLink, 
  Edit3, 
  Trash2, 
  Copy, 
  FileText, 
  BookOpen, 
  Video, 
  Phone, 
  MapPin 
} from 'lucide-vue-next'

const loading = ref(false)
const interviews = ref([])
const stats = ref({ total: 0, upcoming: 0, today: 0, debriefed: 0 })
const activeFilter = ref('all')
const searchKeyword = ref('')
const pagination = ref({ page: 1, pageSize: 20, total: 0 })

// 弹窗状态
const dialogVisible = ref(false)
const editingId = ref(null)
const saving = ref(false)
const form = ref({
  jobId: '',
  round: '一面',
  type: '视频',
  time: '',
  note: '',
  debrief: '',
  syncJobStatus: true
})

const jobOptions = ref([])
const searchingJobs = ref(false)
const jobDrawerRef = ref(null)

// 沉淀题库状态
const syncQuestionsDialogVisible = ref(false)
const currentSyncInterview = ref(null)
const syncDomain = ref('前端')
const rawQuestionsText = ref('')
const syncingQuestions = ref(false)
const fetchInterviews = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams({
      status: activeFilter.value,
      search: searchKeyword.value,
      page: String(pagination.value.page),
      pageSize: String(pagination.value.pageSize)
    })
    const res = await $fetch(`/api/interviews?${params.toString()}`)
    if (res.success) {
      interviews.value = res.data || []
      stats.value = res.stats || stats.value
      pagination.value.total = res.pagination?.total || 0
    } else {
      ElMessage.error(res.error || '获取面试列表失败')
    }
  } catch (err) {
    ElMessage.error('网络请求异常')
  } finally {
    loading.value = false
  }
}

const onFilterChange = () => {
  pagination.value.page = 1
  fetchInterviews()
}

const setFilter = (status) => {
  activeFilter.value = status
  onFilterChange()
}

let searchTimer = null
const handleSearch = () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    pagination.value.page = 1
    fetchInterviews()
  }, 300)
}

const onPageChange = (p) => {
  pagination.value.page = p
  fetchInterviews()
}

const searchJobs = async (query = '') => {
  searchingJobs.value = true
  try {
    const res = await $fetch(`/api/jobs?keyword=${encodeURIComponent(query)}&pageSize=20`)
    if (res && res.jobs) {
      jobOptions.value = res.jobs
    }
  } catch (err) {
    console.error('Job search failed:', err)
  } finally {
    searchingJobs.value = false
  }
}

const isUpcoming = (timeStr) => {
  if (!timeStr) return false
  return new Date(timeStr).getTime() >= Date.now()
}

const isToday = (timeStr) => {
  if (!timeStr) return false
  const d = new Date(timeStr)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() &&
         d.getMonth() === now.getMonth() &&
         d.getDate() === now.getDate()
}

const getTimeStatus = (timeStr) => {
  if (!timeStr) return { text: '时间未定', class: 'neutral' }
  const diff = new Date(timeStr).getTime() - Date.now()
  if (diff > 0) {
    const hours = Math.round(diff / (1000 * 60 * 60))
    if (hours <= 24) {
      return { text: `⚡ 约 ${hours} 小时后开始`, class: 'urgent' }
    } else {
      const days = Math.round(hours / 24)
      return { text: `🟢 ${days} 天后开始`, class: 'upcoming' }
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

const getTypeIcon = (type) => {
  if (type === '电话') return Phone
  if (type === '现场') return MapPin
  return Video
}
const openCreateDialog = () => {
  editingId.value = null
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  tomorrow.setHours(10, 0, 0, 0)
  form.value = {
    jobId: '',
    round: '一面',
    type: '视频',
    time: tomorrow.toISOString().slice(0, 19),
    note: '',
    debrief: '',
    syncJobStatus: true
  }
  searchJobs('')
  dialogVisible.value = true
}

const openEditDialog = (item) => {
  editingId.value = item.id
  form.value = {
    jobId: item.jobId,
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
  if (!editingId.value && !form.value.jobId) {
    ElMessage.warning('请选择关联的职位')
    return
  }
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
        fetchInterviews()
      } else {
        ElMessage.error(res.error || '更新失败')
      }
    } else {
      const res = await $fetch('/api/interviews', {
        method: 'POST',
        body: form.value
      })
      if (res.success) {
        ElMessage.success('成功安排新面试')
        dialogVisible.value = false
        fetchInterviews()
      } else {
        ElMessage.error(res.error || '创建失败')
      }
    }
  } catch (err) {
    ElMessage.error('操作异常: ' + err.message)
  } finally {
    saving.value = false
  }
}

const handleDelete = async (id) => {
  try {
    const res = await $fetch(`/api/interviews/${id}`, { method: 'DELETE' })
    if (res.success) {
      ElMessage.success('面试记录已删除')
      fetchInterviews()
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

const exportAllIcs = () => {
  window.open('/api/interviews/export-all-ics', '_blank')
}

const copyText = async (text, msg = '已复制') => {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(msg)
  } catch (err) {
    ElMessage.error('复制失败')
  }
}

const openJobDrawer = (job) => {
  if (!job) {
    ElMessage.info('暂无职位完整数据')
    return
  }
  if (jobDrawerRef.value) {
    jobDrawerRef.value.open(job, 'interview')
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
    ElMessage.warning('请输入待沉淀的面试问题')
    return
  }

  const lines = rawQuestionsText.value
    .split('\n')
    .map(l => l.replace(/^(\d+[\.\、\s]+|[Q|q]\d+[\:\：\s]+)/, '').trim())
    .filter(Boolean)

  if (lines.length === 0) {
    ElMessage.warning('未能识别出有效问题')
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
      ElMessage.success(`🎉 成功同步 ${res.count} 道真题至标准题库！可在【题库管理】查阅`)
      syncQuestionsDialogVisible.value = false
    } else {
      ElMessage.error(res.error || '同步失败')
    }
  } catch (err) {
    ElMessage.error('同步异常: ' + err.message)
  } finally {
    syncingQuestions.value = false
  }
}

onMounted(() => {
  fetchInterviews()
  searchJobs('')
})
</script>

<style scoped>
.interview-hub-page {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.hub-header {
  margin-bottom: 24px;
}

.header-main {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

.page-title {
  margin: 0 0 6px 0;
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 10px;
}

.title-icon {
  color: #2563eb;
}

.page-subtitle {
  margin: 0;
  font-size: 13px;
  color: #64748b;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.stat-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.stat-card:hover {
  border-color: #93c5fd;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.08);
}

.stat-card.is-active {
  border-color: #3b82f6;
  background: #f8faff;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.12);
}

.stat-num {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.2;
}

.text-primary { color: #2563eb; }
.text-warning { color: #d97706; }
.text-success { color: #16a34a; }
.text-slate { color: #475569; }

.stat-label {
  font-size: 13px;
  color: #64748b;
  margin-top: 4px;
}

.stat-icon-wrap {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bg-blue-50 { background: #eff6ff; }
.text-blue-600 { color: #2563eb; }
.bg-amber-50 { background: #fffbeb; }
.text-amber-600 { color: #d97706; }
.bg-emerald-50 { background: #ecfdf5; }
.text-emerald-600 { color: #059669; }
.bg-slate-50 { background: #f8fafc; }
.text-slate-600 { color: #475569; }

.hub-filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  background: #ffffff;
  padding: 14px 18px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.hub-list-container {
  min-height: 400px;
}

.empty-state {
  background: #ffffff;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  padding: 40px 0;
}

.interview-cards-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hub-interview-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 20px;
  transition: all 0.2s ease;
  position: relative;
}

.hub-interview-card:hover {
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);
  border-color: #cbd5e1;
}

.hub-interview-card.is-upcoming {
  border-left: 5px solid #3b82f6;
}

.hub-interview-card.is-today {
  border-left: 5px solid #f59e0b;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 14px;
}

.company-badge-box {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.company-name {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.platform-tag {
  font-size: 11px;
}

.job-sub-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 14px;
}

.job-title-text {
  font-weight: 600;
  color: #2563eb;
  cursor: pointer;
}

.job-title-text:hover {
  text-decoration: underline;
}

.job-salary-text {
  font-weight: 600;
  color: #ea580c;
}

.job-loc-text {
  color: #64748b;
  font-size: 13px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-pill {
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 12px;
}

.status-pill.urgent {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
}

.status-pill.upcoming {
  background: #eff6ff;
  color: #2563eb;
  border: 1px solid #bfdbfe;
}

.status-pill.past {
  background: #f1f5f9;
  color: #64748b;
}

.card-quick-actions {
  display: flex;
  gap: 2px;
}

.card-meta-row {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: #f8fafc;
  border-radius: 8px;
}

.meta-tags {
  display: flex;
  align-items: center;
  gap: 8px;
}

.round-chip {
  font-weight: 700;
  font-size: 13px;
  color: #1e293b;
  background: #e2e8f0;
  padding: 2px 8px;
  border-radius: 4px;
}

.meta-time {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #334155;
}

.time-icon {
  color: #2563eb;
}

.time-bold {
  font-weight: 600;
}

.time-relative {
  color: #64748b;
  font-size: 12px;
}

.card-note-bar {
  display: flex;
  align-items: center;
  background: #fffbeb;
  border: 1px solid #fef3c7;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 13px;
  margin-bottom: 14px;
  gap: 6px;
}

.note-label {
  color: #b45309;
  font-weight: 500;
}

.note-body {
  color: #78350f;
  flex: 1;
  word-break: break-all;
}

.card-debrief-container {
  background: #ffffff;
  border: 1px solid #f1f5f9;
  border-radius: 8px;
  padding: 12px 14px;
}

.debrief-bar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.debrief-heading {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  display: flex;
  align-items: center;
}

.debrief-content-box {
  background: #f8fafc;
  border-left: 3px solid #f59e0b;
  border-radius: 4px;
  padding: 10px 12px;
}

.debrief-paragraph {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: #334155;
  white-space: pre-wrap;
}

.debrief-empty-box {
  background: #fafafa;
  border: 1px dashed #e2e8f0;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 12px;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.2s ease;
}

.debrief-empty-box:hover {
  border-color: #93c5fd;
  color: #3b82f6;
  background: #f0f7ff;
}

.hub-pagination {
  margin-top: 24px;
  display: flex;
  justify-content: flex-end;
}
</style>
