<template>
  <div class="blacklist-page">
    <!-- Header -->
    <div class="page-header">
      <div class="header-left">
        <h2>企业黑名单管理</h2>
        <p class="subtitle">拉黑企业的岗位将在职位大厅中自动隐藏 · 支持聊天婉拒一键反向提取与手动维护</p>
      </div>
      <div class="header-right">
        <el-button type="primary" plain @click="openChatImportModal">
          <el-icon style="margin-right: 4px;"><ChatLineRound /></el-icon> 粘贴聊天记录提取
        </el-button>
        <el-button type="danger" @click="openManualAddModal">
          <el-icon style="margin-right: 4px;"><Plus /></el-icon> 手动添加黑名单
        </el-button>
        <el-button @click="fetchBlacklist">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-icon-wrapper danger">
          <el-icon><Ban /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.total || 0 }}</div>
          <div class="stat-label">已拉黑企业总数</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrapper warning">
          <el-icon><ChatDotRound /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.chatRejection || 0 }}</div>
          <div class="stat-label">聊天婉拒自动提取</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrapper info">
          <el-icon><User /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.manual || 0 }}</div>
          <div class="stat-label">手动添加黑名单</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrapper success">
          <el-icon><Briefcase /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ totalFilteredJobs }}</div>
          <div class="stat-label">已拦截库内在招岗位</div>
        </div>
      </div>
    </div>

    <!-- Filter Toolbar -->
    <div class="toolbar-card">
      <div class="toolbar-left">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索黑名单企业名称..."
          clearable
          style="width: 280px;"
          @clear="fetchBlacklist"
          @keyup.enter="fetchBlacklist"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>

        <el-select v-model="sourceFilter" placeholder="来源类型" style="width: 160px;" @change="fetchBlacklist">
          <el-option label="全部来源" value="all" />
          <el-option label="💬 聊天婉拒提取" value="chat_rejection" />
          <el-option label="👤 手动添加" value="manual" />
        </el-select>
      </div>

      <div class="toolbar-right">
        <span class="total-text">共 {{ total }} 家企业</span>
      </div>
    </div>

    <!-- Blacklist Table -->
    <div class="table-card" v-loading="loading">
      <el-table :data="blacklist" stripe style="width: 100%" empty-text="暂无黑名单企业">
        <el-table-column prop="companyName" label="公司名称" min-width="180">
          <template #default="{ row }">
            <div class="company-name-cell">
              <span class="name-text">{{ row.companyName }}</span>
              <el-tag v-if="row.jobCount > 0" size="small" type="danger" effect="plain" class="job-count-badge">
                拦截 {{ row.jobCount }} 个在招岗
              </el-tag>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="source" label="拉黑来源" width="140">
          <template #default="{ row }">
            <el-tag v-if="row.source === 'chat_rejection'" type="warning" size="small" effect="light" style="border-radius: 4px;">
              💬 聊天婉拒
            </el-tag>
            <el-tag v-else type="info" size="small" effect="light" style="border-radius: 4px;">
              👤 手动拉黑
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="reason" label="拉黑原因 / 聊天记录摘录" min-width="260">
          <template #default="{ row }">
            <div class="reason-cell" :title="row.reason">
              <span v-if="row.reason">{{ row.reason }}</span>
              <span v-else style="color: #94a3b8;">-</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="createdAt" label="拉黑时间" width="170">
          <template #default="{ row }">
            <span style="color: #64748b; font-size: 13px;">{{ formatDate(row.createdAt) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-popconfirm
              :title="`确认将【${row.companyName}】移出黑名单？`"
              confirm-button-text="移出"
              cancel-button-text="取消"
              confirm-button-type="danger"
              @confirm="handleRemove(row.companyName)"
            >
              <template #reference>
                <el-button type="danger" text size="small">移出黑名单</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <!-- Pagination -->
      <div class="pagination-container" v-if="total > pageSize">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          layout="prev, pager, next"
          :total="total"
          @current-change="fetchBlacklist"
        />
      </div>
    </div>

    <!-- Modal 1: 粘贴聊天记录批量提取 -->
    <el-dialog
      v-model="showChatModal"
      title="💬 粘贴聊天记录反向提取黑名单"
      width="640px"
      destroy-on-close
    >
      <div class="chat-import-guide">
        <p>💡 将 Boss 直聘或招聘软件上的沟通记录直接复制粘贴到下方，系统将自动识别 HR 婉拒信息（如“暂不匹配”、“招满了”、“学历不符”等）并清洗企业名称：</p>
      </div>

      <el-input
        v-model="rawChatInput"
        type="textarea"
        :rows="6"
        placeholder="例如粘贴：
哈啰普惠: 抱歉哈，目前岗位要求不匹配
华为...: 感谢关注，目前HC已满
某某科技: 简历已收到，正在评估中"
      />

      <div style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 12px; color: #94a3b8;">支持 “公司名: 消息内容” 格式直接粘贴</span>
        <el-button size="small" type="primary" plain @click="handleParseChat">
          ⚡ 智能解析预览
        </el-button>
      </div>

      <!-- Preview Table -->
      <div v-if="parsedPreview.length > 0" class="parsed-preview-box">
        <div class="preview-header">
          <span style="font-weight: 600; color: #1e293b;">已识别出 {{ parsedPreview.length }} 家婉拒企业：</span>
          <span style="font-size: 12px; color: #64748b;">(请勾选确认)</span>
        </div>
        <div class="preview-list">
          <div v-for="(item, idx) in parsedPreview" :key="idx" class="preview-item">
            <el-checkbox v-model="item.checked" />
            <div class="preview-info">
              <div class="preview-name">{{ item.companyName }}</div>
              <div class="preview-msg">{{ item.reason }}</div>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showChatModal = false">取消</el-button>
          <el-button
            type="danger"
            :loading="importing"
            :disabled="parsedPreview.length === 0 || !parsedPreview.some(p => p.checked)"
            @click="submitChatBlacklist"
          >
            确认加入黑名单 ({{ parsedPreview.filter(p => p.checked).length }})
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- Modal 2: 手动添加黑名单 -->
    <el-dialog
      v-model="showManualModal"
      title="➕ 手动添加企业黑名单"
      width="480px"
      destroy-on-close
    >
      <el-form label-position="top">
        <el-form-item label="企业名称" required>
          <el-input v-model="manualForm.companyName" placeholder="输入完整的企业名称，如：腾讯科技" />
        </el-form-item>
        <el-form-item label="拉黑原因">
          <el-input v-model="manualForm.reason" placeholder="如：薪资虚标 / 猎头频繁骚扰 / 面试体验极差" />
        </el-form-item>
      </el-form>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showManualModal = false">取消</el-button>
          <el-button type="danger" :loading="manualSubmitting" @click="submitManualBlacklist">
            确认拉黑
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import {
  Ban,
  ChatDotRound,
  ChatLineRound,
  User,
  Briefcase,
  Plus,
  Refresh,
  Search
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const loading = ref(false)
const blacklist = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(30)
const searchKeyword = ref('')
const sourceFilter = ref('all')

const stats = ref({
  total: 0,
  chatRejection: 0,
  manual: 0
})

const totalFilteredJobs = computed(() => {
  return blacklist.value.reduce((acc, cur) => acc + (cur.jobCount || 0), 0)
})

// Modal states
const showChatModal = ref(false)
const rawChatInput = ref('')
const parsedPreview = ref([])
const importing = ref(false)

const showManualModal = ref(false)
const manualForm = ref({ companyName: '', reason: '' })
const manualSubmitting = ref(false)

const fetchBlacklist = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: page.value.toString(),
      pageSize: pageSize.value.toString(),
      keyword: searchKeyword.value,
      source: sourceFilter.value
    })
    const res = await $fetch(`/api/blacklist?${params.toString()}`)
    if (res && res.success) {
      blacklist.value = res.data || []
      total.value = res.total || 0
      if (res.stats) {
        stats.value = res.stats
      }
    } else {
      ElMessage.error(res?.error || '获取黑名单失败')
    }
  } catch (err) {
    ElMessage.error('请求黑名单失败: ' + err.message)
  } finally {
    loading.value = false
  }
}

const handleRemove = async (companyName) => {
  try {
    const res = await $fetch(`/api/blacklist?companyName=${encodeURIComponent(companyName)}`, {
      method: 'DELETE'
    })
    if (res && res.success) {
      ElMessage.success(`已将【${companyName}】移出黑名单`)
      fetchBlacklist()
    } else {
      ElMessage.error(res?.error || '移出失败')
    }
  } catch (err) {
    ElMessage.error('移出黑名单失败: ' + err.message)
  }
}

const openChatImportModal = () => {
  rawChatInput.value = ''
  parsedPreview.value = []
  showChatModal.value = true
}

const handleParseChat = () => {
  if (!rawChatInput.value.trim()) {
    ElMessage.warning('请先输入或粘贴聊天记录文本')
    return
  }

  const lines = rawChatInput.value.split('\n').map(l => l.trim()).filter(Boolean)
  const results = []
  const seen = new Set()

  const rejectionKeywords = [
    '不合适', '暂不匹配', '暂不考虑', '不符合', '暂不合适', '技能不符',
    '不太匹配', '不搭', '未能通过', '未通过',
    '需要本', '要求本', '必须统招', '学历不符', '要求全日制', '专业不符', '经验不符',
    '感谢关注', '很遗憾', '抱歉', '对不起', '感谢投递', '祝您早日', '祝您找到更合适',
    '招满', '招完', '已招到', '停止招聘', 'hc已满', 'HC已满', '职位已关闭', '暂无合适空缺'
  ]

  for (const line of lines) {
    const splitIdx = line.search(/[:：\t\-—]/)
    if (splitIdx > 0) {
      const comp = line.slice(0, splitIdx).replace(/[·.]{2,}/g, '').trim()
      const msg = line.slice(splitIdx + 1).trim()

      if (comp.length >= 2 && !seen.has(comp)) {
        const isRej = rejectionKeywords.some(kw => msg.includes(kw)) || /感谢.*但/i.test(msg) || /遗憾.*无法/i.test(msg)
        if (isRej) {
          seen.add(comp)
          results.push({
            companyName: comp,
            message: msg,
            reason: `沟通婉拒: ${msg.slice(0, 80)}`,
            checked: true
          })
        }
      }
    }
  }

  parsedPreview.value = results
  if (results.length === 0) {
    ElMessage.info('未识别到明确婉拒语句，可检查是否包含冒号分隔，如 “公司名: 消息”')
  } else {
    ElMessage.success(`成功识别出 ${results.length} 家婉拒企业`)
  }
}

const submitChatBlacklist = async () => {
  const selected = parsedPreview.value.filter(p => p.checked)
  if (selected.length === 0) return

  importing.value = true
  try {
    const res = await $fetch('/api/blacklist', {
      method: 'POST',
      body: {
        companies: selected.map(s => ({
          companyName: s.companyName,
          reason: s.reason,
          source: 'chat_rejection'
        }))
      }
    })

    if (res && res.success) {
      ElMessage.success(res.message || '批量拉黑成功！')
      showChatModal.value = false
      fetchBlacklist()
    } else {
      ElMessage.error(res?.error || '导入失败')
    }
  } catch (err) {
    ElMessage.error('导入失败: ' + err.message)
  } finally {
    importing.value = false
  }
}

const openManualAddModal = () => {
  manualForm.value = { companyName: '', reason: '' }
  showManualModal.value = true
}

const submitManualBlacklist = async () => {
  if (!manualForm.value.companyName.trim()) {
    ElMessage.warning('请输入企业名称')
    return
  }

  manualSubmitting.value = true
  try {
    const res = await $fetch('/api/blacklist', {
      method: 'POST',
      body: {
        companyName: manualForm.value.companyName.trim(),
        reason: manualForm.value.reason.trim() || '人工拉黑',
        source: 'manual'
      }
    })

    if (res && res.success) {
      ElMessage.success(`已成功将【${manualForm.value.companyName}】加入黑名单`)
      showManualModal.value = false
      fetchBlacklist()
    } else {
      ElMessage.error(res?.error || '添加失败')
    }
  } catch (err) {
    ElMessage.error('添加失败: ' + err.message)
  } finally {
    manualSubmitting.value = false
  }
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '-'
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

onMounted(() => {
  fetchBlacklist()
})
</script>

<style scoped>
.blacklist-page {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header-left h2 {
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 6px 0;
  color: var(--text-primary);
}

.subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

.header-right {
  display: flex;
  gap: 12px;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.stat-card {
  background: var(--bg-card);
  border-radius: var(--radius-m);
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-color);
}

.stat-icon-wrapper {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
}

.stat-icon-wrapper.danger { background: #fee2e2; color: #dc2626; }
.stat-icon-wrapper.warning { background: #fef3c7; color: #d97706; }
.stat-icon-wrapper.info { background: #e0f2fe; color: #0284c7; }
.stat-icon-wrapper.success { background: #dcfce7; color: #16a34a; }

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}

.stat-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.toolbar-card {
  background: var(--bg-card);
  border-radius: var(--radius-m);
  padding: 16px 20px;
  margin-bottom: 16px;
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toolbar-left {
  display: flex;
  gap: 12px;
}

.total-text {
  font-size: 13px;
  color: var(--text-secondary);
}

.table-card {
  background: var(--bg-card);
  border-radius: var(--radius-m);
  padding: 20px;
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-color);
}

.company-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.name-text {
  font-weight: 600;
  color: #1e293b;
}

.job-count-badge {
  font-size: 11px;
  border-radius: 4px;
  padding: 0 6px;
}

.reason-cell {
  color: #475569;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pagination-container {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

.chat-import-guide {
  margin-bottom: 12px;
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
}

.parsed-preview-box {
  margin-top: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px;
  background: #f8fafc;
  max-height: 240px;
  overflow-y: auto;
}

.preview-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  font-size: 13px;
}

.preview-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preview-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: #fff;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #f1f5f9;
}

.preview-info {
  flex: 1;
}

.preview-name {
  font-weight: 600;
  font-size: 13px;
  color: #1e293b;
}

.preview-msg {
  font-size: 12px;
  color: #e11d48;
  margin-top: 2px;
}
</style>
