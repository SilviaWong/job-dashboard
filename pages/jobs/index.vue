<template>
  <div class="jobs-page">
    <el-card shadow="never" class="table-card">
      <!-- Toolbar -->
      <template #header>
        <div class="toolbar">
          <h2>职位列表 <el-tag type="info" size="small">{{ total }}</el-tag></h2>
          <div class="filters">
            <el-input 
              v-model="keywordFilter" 
              placeholder="搜索职位或公司" 
              clearable 
              style="width: 180px" 
              @change="() => fetchJobs(false)"
            />
            <el-select v-model="platformFilter" placeholder="全部平台" style="width: 120px" @change="() => fetchJobs(false)">
              <el-option label="全部平台" value="all"></el-option>
              <el-option label="Boss直聘" value="Boss直聘"></el-option>
              <el-option label="前程无忧" value="51job"></el-option>
              <el-option label="智联招聘" value="智联"></el-option>
              <el-option label="猎聘" value="猎聘"></el-option>
            </el-select>
            <el-select v-model="educationFilter" placeholder="全部学历" style="width: 120px" @change="() => fetchJobs(false)">
              <el-option label="全部学历" value="all"></el-option>
              <el-option label="不限" value="不限"></el-option>
              <el-option label="大专" value="大专"></el-option>
              <el-option label="本科" value="本科"></el-option>
              <el-option label="硕士" value="硕士"></el-option>
              <el-option label="博士" value="博士"></el-option>
            </el-select>
            <el-radio-group v-model="statusFilter" size="small" @change="() => fetchJobs(false)">
              <el-radio-button value="all">全部</el-radio-button>
              <el-radio-button value="normal">常规</el-radio-button>
            </el-radio-group>
            
            <el-checkbox v-model="filterFavoritesOnly" @change="() => fetchJobs(false)">
              <el-icon><Star /></el-icon> 只看收藏
            </el-checkbox>
            <el-checkbox v-model="filterShowHidden" @change="() => fetchJobs(false)">
              <el-icon><Eye /></el-icon> 只看隐藏
            </el-checkbox>
            <el-checkbox v-model="filterShowBlacklisted" @change="() => fetchJobs(false)">
              <el-icon><Ban /></el-icon> 显示拉黑
            </el-checkbox>
          </div>
          
          <div class="actions">
            <el-button v-if="!batchAnalyzing" type="success" size="small" @click="handleBatchAiDiagnosis" :disabled="loading">
              <el-icon><Bot /></el-icon>&nbsp;批量 AI 诊断
            </el-button>
            <el-button v-else type="danger" size="small" @click="cancelBatchAiDiagnosis">
              <el-icon><Loader2 class="is-loading" /></el-icon>&nbsp;取消诊断
            </el-button>
            <el-button type="primary" size="small" @click="() => fetchJobs(false)" :loading="loading">
              刷新数据
            </el-button>
          </div>
        </div>
      </template>

      <!-- Job List (Full width cards like the extension) -->
      <client-only>
        <div class="job-list-vertical">
          <el-empty v-if="jobList.length === 0 && !loading" description="暂无符合条件的职位" />
          
          <div 
            v-else
            class="job-card-wide" 
            v-for="job in jobList" 
            :key="job.id || job.jobId"
            :class="{'is-blacklisted': job.isBlacklisted, 'is-hidden': job.isHidden}"
            @click="viewDetails(job)"
          >
            <!-- Header: Title & Salary -->
            <div class="job-header">
              <span class="job-title">{{ job.title }}</span>
              <span class="job-salary">{{ job.salary }}</span>
              
              <!-- AI Score Badge (Top Right) -->
              <div v-if="job.aiResult" class="card-score-badge" :style="getScoreStyle(job.aiResult.score)">
                {{ job.aiResult.score }}<span style="font-size: 12px; font-weight: normal; margin-left: 2px;">分</span>
              </div>
            </div>

            <!-- Company -->
            <div class="job-company">
              <span class="company-link">{{ job.normalizedData?.companyFullName || job.normalizedData?.brandName || job.companyName }}</span>
            </div>

            <!-- Tags -->
            <div class="job-tags">
              <!-- Special status badges -->
              <el-tag v-if="job.status === 'expired'" type="danger" size="small" effect="dark" style="border: none;">已失效</el-tag>
              
              <template v-if="job.isHidden && job.tags && Array.isArray(job.tags) && job.tags.length > 0">
                <el-tag v-for="(t, idx) in job.tags" :key="'reason-'+idx" type="info" size="small" effect="dark" style="border: none;">
                  🚫 {{ t }}
                </el-tag>
              </template>

              <!-- Regular info tags -->
              <span class="tag-item">{{ job.platform }}</span>
              <span class="tag-item" v-if="job.normalizedData?.city || job.location">
                {{ [job.normalizedData?.city, job.normalizedData?.area, job.normalizedData?.businessDistrict].filter(Boolean).join('·') }}
              </span>
              <span class="tag-item">{{ job.normalizedData?.experience || '不限' }}</span>
              <span class="tag-item">{{ job.normalizedData?.degree || '不限' }}</span>
              <!-- Dynamically render first few tags if available -->
              <template v-if="job.normalizedData?.skills?.length">
                <span class="tag-item" v-for="(tag, idx) in job.normalizedData.skills.slice(0, 5)" :key="idx">{{ tag }}</span>
              </template>
              <template v-else-if="job.normalizedData?.welfareList?.length">
                <span class="tag-item" v-for="(tag, idx) in job.normalizedData.welfareList.slice(0, 5)" :key="idx">{{ tag }}</span>
              </template>
              <!-- 猎头/代招标签，如果前面有其他标签，加一点间隔 -->
              <span class="tag-item" style="background-color: #fce4ec; color: #c2185b; border: 1px solid #f8bbd0;" v-if="job.normalizedData?.isHeadhunter">猎头/代招</span> 
            </div>

            <!-- Meta Info -->
            <div class="job-meta">
              <span v-if="job.normalizedData?.publishDate" class="meta-item">首发: {{ job.normalizedData.publishDate }}</span>
              <span v-if="job.normalizedData?.updateDate" class="meta-item">修改: {{ job.normalizedData.updateDate }}</span>
              <span class="meta-item">状态: {{ job.status || '-' }}</span>
            </div>

            <div class="dashed-divider"></div>

            <!-- Footer Actions -->
            <div class="job-footer">
              <div class="footer-left">
                <el-button round size="small" :color="job.isFavorited ? '#f39c12' : '#f1c40f'" style="color: #fff;" @click.stop>{{ job.isFavorited ? '⭐ 已收藏' : '☆ 收藏' }}</el-button>
                <el-button round size="small" color="#e74c3c" style="color: #fff;" @click.stop="openUnsuitableModal(job)">👎 不合适</el-button>
                <el-button round size="small" color="#95a5a6" style="color: #fff;" @click.stop>{{ job.isBlacklisted ? '⛔ 已拉黑' : '⛔ 拉黑' }}</el-button>
                <el-button round size="small" color="#e74c3c" style="color: #fff;" @click.stop="handleDeleteJob(job)">删除</el-button>
              </div>
              <div class="footer-right">
                <el-button round size="small" color="#27ae60" style="color: #fff;" @click.stop>📅 面试</el-button>
                <el-button 
                  round 
                  size="small" 
                  color="#9b59b6" 
                  style="color: #fff;" 
                  :loading="analyzingId === job.jobId"
                  @click.stop="handleAiDiagnosis(job)"
                >🤖 AI 诊断</el-button>
                <el-button round size="small" color="#3498db" style="color: #fff;" @click.stop="openOriginalUrl(job)">详情 🔗</el-button>
              </div>
            </div>
          </div>

          <!-- Intersection Observer Trigger -->
          <div ref="loadMoreTrigger" class="observer-trigger" style="height: 10px; width: 100%;"></div>

          <div v-if="loading" class="loading-more">
            <el-icon class="is-loading"><Loader2 /></el-icon> 正在加载更多数据...
          </div>
          <div v-if="!hasMore && jobList.length > 0" class="no-more">
            已经到底啦 ~
          </div>
        </div>
        
        <template #fallback>
          <div style="padding: 20px; text-align: center;">加载中...</div>
        </template>
      </client-only>
    </el-card>

    <!-- 不合适标签弹窗 -->
    <el-dialog v-model="unsuitableModalVisible" title="标记为不合适" width="400px" destroy-on-close>
      <div style="margin-bottom: 15px; color: #7f8c8d; font-size: 14px;">选择或输入不合适的原因：</div>
      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
        <el-button 
          v-for="tag in predefinedTags" 
          :key="tag"
          size="small"
          :type="selectedTags.includes(tag) ? 'primary' : 'default'"
          @click="toggleTag(tag)"
        >
          {{ tag }}
        </el-button>
      </div>
      <div style="margin-top: 15px;">
        <el-input 
          v-model="customTagInput" 
          placeholder="其他原因 (按回车添加)"
          @keyup.enter="addCustomTag"
        />
      </div>
      <div style="margin-top: 15px; display: flex; flex-wrap: wrap; gap: 8px;" v-if="selectedTags.length > 0">
        <el-tag
          v-for="tag in selectedTags"
          :key="tag"
          closable
          type="primary"
          @close="removeTag(tag)"
        >
          {{ tag }}
        </el-tag>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="unsuitableModalVisible = false">取消</el-button>
          <el-button type="danger" @click="saveUnsuitableTags" :loading="savingTags">保存并隐藏</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 侧边抽屉：职位详情 -->
    <JobDetailDrawer ref="jobDetailDrawerRef" @status-changed="handleJobStatusChange" />
  </div>
</template>

<script setup>
import { shallowRef, ref, onMounted, onUnmounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Star, Eye, Ban, ThumbsDown, Trash2, Calendar, Bot, ExternalLink, Loader2 } from 'lucide-vue-next'

const jobList = shallowRef([])
const loading = ref(false)
const analyzingId = ref(null)
const batchAnalyzing = ref(false)
const batchCancelled = ref(false)

const page = ref(1)
const pageSize = ref(20)
const hasMore = ref(true)
const total = ref(0)

const statusFilter = ref('normal')
const filterFavoritesOnly = ref(false)
const filterShowHidden = ref(false)
const filterShowBlacklisted = ref(false)

const platformFilter = ref('all')
const educationFilter = ref('all')
const keywordFilter = ref('')

const jobDetailDrawerRef = ref(null)

const loadMoreTrigger = ref(null)
let observer = null

const fetchJobs = async (isLoadMore = false) => {
  if (!isLoadMore) {
    page.value = 1
    hasMore.value = true
  }
  
  if (!hasMore.value) return

  loading.value = true
  try {
    const params = new URLSearchParams({
      page: page.value,
      pageSize: pageSize.value,
      status: statusFilter.value,
      filterFavoritesOnly: filterFavoritesOnly.value,
      filterShowHidden: filterShowHidden.value,
      filterShowBlacklisted: filterShowBlacklisted.value,
      platform: platformFilter.value,
      education: educationFilter.value,
      keyword: keywordFilter.value,
    })
    const res = await $fetch(`/api/jobs?${params.toString()}`)
    if (res && res.success && Array.isArray(res.data)) {
      if (isLoadMore) {
        jobList.value = [...jobList.value, ...res.data]
      } else {
        jobList.value = res.data
      }
      hasMore.value = res.hasMore
      total.value = res.total || 0
    } else {
      if (!isLoadMore) jobList.value = []
      hasMore.value = false
    }
  } catch (error) {
    console.error('Failed to fetch jobs:', error)
    if (!isLoadMore) jobList.value = []
  } finally {
    loading.value = false
  }
}

const loadMore = () => {
  if (loading.value || !hasMore.value) return
  page.value++
  fetchJobs(true)
}

const viewDetails = (row) => {
  if (jobDetailDrawerRef.value) {
    jobDetailDrawerRef.value.open(row)
  }
}

const openOriginalUrl = (job) => {
  const url = job.normalizedData?.jobUrl
  if (url) {
    window.open(url, '_blank', 'noopener,noreferrer')
  } else {
    ElMessage.warning('未找到原网页链接')
  }
}

const handleDeleteJob = async (job) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除职位 "${job.jobName}" 吗？此操作将彻底删除数据，不可恢复。`,
      '物理删除确认',
      {
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger'
      }
    )
    
    const res = await $fetch(`/api/jobs/${job.id}`, {
      method: 'DELETE'
    })
    
    if (res && res.success) {
      ElMessage.success('删除成功')
      jobList.value = jobList.value.filter(item => item.id !== job.id)
    } else {
      ElMessage.error(res?.error || res?.message || '删除失败')
    }
  } catch (e) {
    if (e !== 'cancel') {
      console.error(e)
      ElMessage.error('删除操作出错')
    }
  }
}

const handleBatchAiDiagnosis = async () => {
  if (analyzingId.value || batchAnalyzing.value) return
  
  const jobsToAnalyze = jobList.value.filter(job => !job.aiResult || job.aiResult.score === null || job.aiResult.score === undefined)
  
  if (jobsToAnalyze.length === 0) {
    ElMessage.info('当前列表中的职位都已诊断过啦！')
    return
  }

  try {
    await ElMessageBox.confirm(
      `当前列表有 ${jobsToAnalyze.length} 个职位未诊断，是否开始批量诊断？（将按顺序逐个进行，可能需要较长时间）`,
      '批量 AI 诊断',
      {
        confirmButtonText: '开始诊断',
        cancelButtonText: '取消',
        type: 'info',
      }
    )
  } catch {
    return
  }

  batchAnalyzing.value = true
  batchCancelled.value = false
  let successCount = 0
  let failCount = 0

  for (const job of jobsToAnalyze) {
    if (batchCancelled.value) break 
    
    analyzingId.value = job.jobId
    try {
      const res = await $fetch('/api/jobs/analyze', {
        method: 'POST',
        body: { jobId: job.jobId }
      })
      
      if (res && res.success && res.data) {
        job.aiResult = res.data
        successCount++
      } else {
        failCount++
      }
    } catch (e) {
      console.error(e)
      failCount++
    } finally {
      analyzingId.value = null
    }
    
    await new Promise(resolve => setTimeout(resolve, 1500))
  }
  
  batchAnalyzing.value = false
  if (batchCancelled.value) {
    ElMessage.info(`批量诊断已取消。本次成功: ${successCount}，失败: ${failCount}。`)
  } else if (failCount === 0) {
    ElMessage.success(`批量诊断完成！成功诊断 ${successCount} 个职位。`)
  } else {
    ElMessage.warning(`批量诊断结束。成功: ${successCount}，失败: ${failCount}。`)
  }
}

const cancelBatchAiDiagnosis = () => {
  if (!batchAnalyzing.value) return
  batchCancelled.value = true
  ElMessage.warning('正在取消，等待当前任务结束后停止...')
}

const handleAiDiagnosis = async (job) => {
  if (analyzingId.value) return
  
  analyzingId.value = job.jobId
  try {
    const res = await $fetch('/api/jobs/analyze', {
      method: 'POST',
      body: { jobId: job.jobId }
    })
    
    if (res && res.success && res.data) {
      ElMessage.success('AI诊断完成')
      job.aiResult = res.data
    } else {
      ElMessage.error(res?.error || 'AI诊断失败')
    }
  } catch (error) {
    console.error('AI diagnosis error:', error)
    ElMessage.error('AI诊断出现异常')
  } finally {
    analyzingId.value = null
  }
}

// 不合适标签弹窗逻辑
const unsuitableModalVisible = ref(false)
const currentTaggingJob = ref(null)
const predefinedTags = ['学历不符', '经验不符', '薪资太低', '外包岗位', '距离太远', '需要外语']
const selectedTags = ref([])
const customTagInput = ref('')
const savingTags = ref(false)

const openUnsuitableModal = (job) => {
  currentTaggingJob.value = job
  selectedTags.value = []
  if (job.tags) {
    try {
      const parsedTags = typeof job.tags === 'string' ? JSON.parse(job.tags) : job.tags
      if (Array.isArray(parsedTags)) {
        selectedTags.value = [...parsedTags]
      }
    } catch(e) {}
  }
  customTagInput.value = ''
  unsuitableModalVisible.value = true
}

const toggleTag = (tag) => {
  if (selectedTags.value.includes(tag)) {
    selectedTags.value = selectedTags.value.filter(t => t !== tag)
  } else {
    selectedTags.value.push(tag)
  }
}

const addCustomTag = () => {
  const tag = customTagInput.value.trim()
  if (tag && !selectedTags.value.includes(tag)) {
    selectedTags.value.push(tag)
  }
  customTagInput.value = ''
}

const removeTag = (tag) => {
  selectedTags.value = selectedTags.value.filter(t => t !== tag)
}

const saveUnsuitableTags = async () => {
  if (!currentTaggingJob.value) return
  savingTags.value = true
  try {
    const res = await $fetch(`/api/jobs/${currentTaggingJob.value.id}`, {
      method: 'PUT',
      body: {
        isHidden: true,
        tags: selectedTags.value
      }
    })
    
    if (res && res.success) {
      ElMessage.success('标记成功并已隐藏职位')
      currentTaggingJob.value.isHidden = true
      currentTaggingJob.value.tags = [...selectedTags.value]
      
      if (!filterShowHidden.value) {
        jobList.value = jobList.value.filter(j => j.jobId !== currentTaggingJob.value.jobId)
      }
      
      unsuitableModalVisible.value = false
    } else {
      ElMessage.error(res?.error || res?.message || '保存失败')
    }
  } catch (error) {
    console.error('Failed to save unsuitable tags:', error)
    ElMessage.error('保存失败')
  } finally {
    savingTags.value = false
  }
}

const handleJobStatusChange = (jobData, status) => {
  if (status === 'expired') {
    // Remove the job from the local list so it disappears from the UI
    jobList.value = jobList.value.filter(j => j.jobId !== jobData.jobId)
  }
}

const getPlatformType = (platform) => {
  if (platform === 'Boss直聘') return 'primary'
  if (platform === '51job') return 'warning'
  if (platform === '智联') return 'success'
  if (platform === '猎聘') return 'danger'
  return 'info'
}

const getScoreStyle = (score) => {
  if (!score) return { backgroundColor: '#fee2e2', color: '#b91c1c' }
  if (score >= 80) return { backgroundColor: '#dcfce3', color: '#15803d' } // High match (Green)
  if (score >= 60) return { backgroundColor: '#ffedd5', color: '#c2410c' } // Mid match (Orange)
  return { backgroundColor: '#fee2e2', color: '#b91c1c' } // Low match (Red)
}

const tableRowClassName = ({ row }) => {
  if (row.isBlacklisted) return 'row-blacklisted'
  if (row.isHidden) return 'row-hidden'
  return ''
}

watch(loadMoreTrigger, (el) => {
  if (el) {
    if (observer) {
      observer.disconnect()
    }
    observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore.value && !loading.value) {
        loadMore()
      }
    }, { rootMargin: '250px' })
    observer.observe(el)
  }
})

onMounted(() => {
  fetchJobs(false)
})

onUnmounted(() => {
  if (observer) {
    observer.disconnect()
  }
})
</script>

<style scoped>
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-card, #FFFFFF);
  padding: 14px 20px;
  border-radius: var(--radius-m, 14px);
  box-shadow: var(--shadow-card, 0 4px 24px rgba(0,0,0,0.04));
  margin-bottom: 20px;
}
.filters {
  display: flex;
  align-items: center;
  gap: 16px;
}
/* Wide Job Card Styles */
.job-list-vertical {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 4px;
  background: transparent;
}
.loading-more, .no-more {
  text-align: center;
  padding: 15px;
  color: var(--text-secondary, #86868B);
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.is-loading {
  animation: rotating 2s linear infinite;
}
@keyframes rotating {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.job-card-wide {
  position: relative;
  background: var(--bg-card, #FFFFFF);
  border-radius: var(--radius-l, 20px);
  padding: 24px;
  box-shadow: var(--shadow-card, 0 4px 24px rgba(0,0,0,0.04));
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(0, 0, 0, 0.04);
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  cursor: pointer;
}
.job-card-wide:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-hover, 0 12px 40px rgba(0,0,0,0.08));
}
.job-card-wide.is-blacklisted {
  border: 2px solid var(--error-color, #FF3B30) !important;
  opacity: 0.6;
  background: #fffafa;
}


.card-score-badge {
  position: absolute;
  top: 24px;
  right: 24px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 15px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.04);
}

.job-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.job-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary, #1D1D1F);
}
.job-salary {
  font-size: 17px;
  font-weight: 700;
  color: var(--error-color, #FF3B30);
}

.job-company {
  margin-bottom: 12px;
}
.company-link {
  color: var(--primary-color, #007AFF);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
}
.company-link:hover {
  text-decoration: underline;
}

.job-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
.tag-item {
  background: #F2F2F7;
  color: #636366;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
}

.job-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--text-secondary, #86868B);
  margin-bottom: 12px;
}

.dashed-divider {
  height: 1px;
  border-top: 1px dashed rgba(0,0,0,0.05);
  margin-bottom: 16px;
}

.job-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.footer-left, .footer-right {
  display: flex;
  gap: 8px;
}
:deep(.el-button.is-round) {
  padding: 6px 14px;
  font-weight: 500;
  border: none;
  border-radius: 20px;
  font-size: 12px;
  box-shadow: none;
}
:deep(.el-button.is-round:hover) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

</style>
