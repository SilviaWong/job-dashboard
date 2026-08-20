<template>
  <div class="jobs-page">
    <el-card shadow="never" class="table-card">
      <!-- Toolbar -->
      <template #header>
        <div class="toolbar">
          <div class="toolbar-row">
            <h2>职位列表 <el-tag type="info" size="small">{{ total }}</el-tag></h2>
          </div>
          
          <div class="toolbar-row">
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
              <el-select v-model="aiDiagnosisFilter" placeholder="AI诊断状态" style="width: 120px" @change="() => fetchJobs(false)">
                <el-option label="全部状态" value="all"></el-option>
                <el-option label="已诊断" value="diagnosed"></el-option>
                <el-option label="未诊断" value="undiagnosed"></el-option>
              </el-select>
              <el-select v-model="salaryFilter" placeholder="薪资范围" style="width: 120px" @change="() => fetchJobs(false)">
                <el-option label="全部薪资" value="all"></el-option>
                <el-option label="10k以下" value="0-10"></el-option>
                <el-option label="10k-20k" value="10-20"></el-option>
                <el-option label="20k-30k" value="20-30"></el-option>
                <el-option label="30k-50k" value="30-50"></el-option>
                <el-option label="50k以上" value="50-999"></el-option>
              </el-select>
              <el-radio-group v-model="statusFilter" size="small" @change="() => fetchJobs(false)">
                <el-radio-button value="all">全部</el-radio-button>
                <el-radio-button :value="JobStatus.NORMAL">常规</el-radio-button>
              </el-radio-group>
            </div>
          </div>
          
          <div class="toolbar-row bottom-row">
            <div class="filters-checkboxes">
              <el-checkbox 
                :model-value="isAllSelected" 
                :indeterminate="isIndeterminate" 
                @change="handleSelectAll"
              >
                全选 <span v-if="selectedJobIds.length > 0">({{ selectedJobIds.length }}/{{ jobList.length }})</span>
              </el-checkbox>
              <el-checkbox v-model="filterFavoritesOnly" @change="() => fetchJobs(false)">
                <el-icon><Star /></el-icon> 只看收藏
              </el-checkbox>
              <el-checkbox v-model="filterShowHidden" @change="() => fetchJobs(false)">
                <el-icon><Eye /></el-icon> 只看隐藏
              </el-checkbox>
              <el-checkbox v-model="filterShowBlacklisted" @change="() => fetchJobs(false)">
                <el-icon><Ban /></el-icon> 显示拉黑
              </el-checkbox>
              <el-checkbox v-if="platformFilter === 'Boss直聘'" v-model="filterMissingBossDetail" @change="() => fetchJobs(false)">
                未抓取详情
              </el-checkbox>
            </div>
            
            <div class="actions">
              <!-- 批量操作专区 (当勾选了职位时高亮显示) -->
              <template v-if="selectedJobIds.length > 0">
                <el-button type="warning" size="small" @click="handleBatchFavorite(true)" :loading="batchFavoriting">
                  <el-icon><Star /></el-icon>&nbsp;批量收藏 ({{ selectedJobIds.length }})
                </el-button>
                <el-button type="danger" size="small" @click="openBatchUnsuitableModal">
                  <el-icon><ThumbsDown /></el-icon>&nbsp;批量不合适 ({{ selectedJobIds.length }})
                </el-button>
                <el-button type="danger" plain size="small" @click="handleBatchDelete" :loading="batchDeleting">
                  <el-icon><Trash2 /></el-icon>&nbsp;批量删除 ({{ selectedJobIds.length }})
                </el-button>
                <el-button size="small" text @click="clearSelection" style="color: #909399;">
                  清空已选
                </el-button>
              </template>

              <el-button v-if="!batchAnalyzing" type="success" size="small" @click="handleBatchAiDiagnosis" :disabled="loading">
                <el-icon><Bot /></el-icon>&nbsp;批量 AI 诊断
              </el-button>
              <el-button v-else type="danger" size="small" @click="cancelBatchAiDiagnosis">
                <el-icon><Loader2 class="is-loading" /></el-icon>&nbsp;取消诊断
              </el-button>
              
              <el-button v-if="!batchOpening" type="warning" size="small" @click="handleBatchOpenUrls" :disabled="loading || batchAnalyzing">
                <el-icon><ExternalLink /></el-icon>&nbsp;批量打开网页
              </el-button>
              <el-button v-else type="danger" size="small" @click="cancelBatchOpenUrls">
                <el-icon><Loader2 class="is-loading" /></el-icon>&nbsp;取消打开
              </el-button>
              
              <el-button type="primary" size="small" @click="() => fetchJobs(false)" :loading="loading">
                刷新数据
              </el-button>
            </div>
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
            :id="'job-card-' + job.jobId"
            :class="{'is-blacklisted': job.isBlacklisted, 'is-hidden': job.isHidden, 'is-selected': selectedJobIds.includes(job.id)}"
            @click="viewDetails(job)"
          >
            <!-- Header: Selection Checkbox + Title & Salary -->
            <div class="job-header">
              <div class="job-select-checkbox" @click.stop>
                <el-checkbox
                  :model-value="selectedJobIds.includes(job.id)"
                  @change="(val) => handleJobCheckChange(job.id, val)"
                />
              </div>
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
              <el-tag v-if="job.status === JobStatus.EXPIRED" type="danger" size="small" effect="dark" style="border: none;">已失效</el-tag>
              
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
              <span class="meta-item">状态: {{ job.normalizedData?.jobStatus || job.status || '-' }}</span>
            </div>

            <div class="dashed-divider"></div>

            <!-- Footer Actions -->
            <div class="job-footer">
              <div class="footer-left">
                <el-button round size="small" :color="job.isFavorited ? '#ea580c' : '#f1f5f9'" :style="{ color: job.isFavorited ? '#fff' : '#64748b', border: job.isFavorited ? 'none' : '1px solid #cbd5e1' }" @click.stop="toggleFavorite(job)">{{ job.isFavorited ? '⭐ 已收藏' : '☆ 收藏' }}</el-button>
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
                  :loading="analyzingIds.includes(job.jobId)"
                  @click.stop="handleAiDiagnosis(job)"
                >🤖 AI 诊断</el-button>
                <el-button round size="small" type="primary" plain @click.stop="copyJobInfo(job)"><el-icon><Copy /></el-icon>&nbsp;一键复制</el-button>
                <a 
                  :href="job.normalizedData?.jobUrl || job.jobUrl" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  style="text-decoration: none; margin-left: 12px;" 
                  class="detail-link"
                  @click.stop
                >
                  <el-button round size="small" color="#3498db" style="color: #fff;">详情 🔗</el-button>
                </a>
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

    <!-- 不合适标签弹窗 (支持单选与批量) -->
    <el-dialog 
      v-model="unsuitableModalVisible" 
      :title="isBatchUnsuitable ? `批量标记为不合适 (已选 ${selectedJobIds.length} 个职位)` : '标记为不合适'" 
      width="400px" 
      destroy-on-close
    >
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
import { shallowRef, ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { JobStatus } from '~/utils/enums'
import { Star, Eye, Ban, ThumbsDown, Trash2, Calendar, Bot, ExternalLink, Loader2, Copy } from 'lucide-vue-next'

const jobList = shallowRef([])
const loading = ref(false)
const analyzingIds = ref([])
const batchAnalyzing = ref(false)
const batchCancelled = ref(false)
const batchOpening = ref(false)
const batchOpenCancelled = ref(false)

// 批量选择与操作状态
const selectedJobIds = ref([])
const batchFavoriting = ref(false)
const batchDeleting = ref(false)
const isBatchUnsuitable = ref(false)

const isAllSelected = computed(() => {
  return jobList.value.length > 0 && selectedJobIds.value.length === jobList.value.length
})

const isIndeterminate = computed(() => {
  return selectedJobIds.value.length > 0 && selectedJobIds.value.length < jobList.value.length
})

const handleSelectAll = (val) => {
  if (val) {
    selectedJobIds.value = jobList.value.map(j => j.id)
  } else {
    selectedJobIds.value = []
  }
}

const handleJobCheckChange = (jobId, val) => {
  if (val) {
    if (!selectedJobIds.value.includes(jobId)) {
      selectedJobIds.value = [...selectedJobIds.value, jobId]
    }
  } else {
    selectedJobIds.value = selectedJobIds.value.filter(id => id !== jobId)
  }
}

const clearSelection = () => {
  selectedJobIds.value = []
}

const page = ref(1)
const pageSize = ref(20)
const hasMore = ref(true)
const total = ref(0)

const statusFilter = ref(JobStatus.NORMAL)
const filterFavoritesOnly = ref(false)
const filterShowHidden = ref(false)
const filterShowBlacklisted = ref(false)
const filterMissingBossDetail = ref(false)

const platformFilter = ref('all')
const educationFilter = ref('all')
const keywordFilter = ref('')
const aiDiagnosisFilter = ref('all')
const salaryFilter = ref('all')

const jobDetailDrawerRef = ref(null)

const loadMoreTrigger = ref(null)
let observer = null

const fetchJobs = async (isLoadMore = false) => {
  if (!isLoadMore) {
    page.value = 1
    hasMore.value = true
    selectedJobIds.value = []
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
      filterMissingBossDetail: filterMissingBossDetail.value,
      platform: platformFilter.value,
      education: educationFilter.value,
      keyword: keywordFilter.value,
      aiDiagnosisFilter: aiDiagnosisFilter.value,
      salaryFilter: salaryFilter.value,
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
  if (batchAnalyzing.value) return
  
  const pendingJobs = jobList.value.filter(job => !job.aiResult || job.aiResult.score === null || job.aiResult.score === undefined)
  if (pendingJobs.length === 0 && !hasMore.value) {
    ElMessage.info('所有职位都已诊断完毕！')
    return
  }

  try {
    await ElMessageBox.confirm(
      `准备开始持续批量诊断。程序会自动向下翻页并诊断所有未处理的职位。支持并发处理（并发数: 5）。是否开始？（随时可点击右上角取消）`,
      '持续批量 AI 诊断',
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
  const maxConcurrent = 5

  // 并发任务调度函数
  const processJob = async (job) => {
    if (batchCancelled.value) return
    analyzingIds.value.push(job.jobId)
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
      const index = analyzingIds.value.indexOf(job.jobId)
      if (index > -1) analyzingIds.value.splice(index, 1)
    }
    // 加入短暂停顿，防止接口过载
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  let activePromises = []
  
  while (!batchCancelled.value) {
    // 找出尚未有结果，并且当前不在分析队列中的任务
    const jobsToAnalyze = jobList.value.filter(job => 
      (!job.aiResult || job.aiResult.score === null || job.aiResult.score === undefined) && 
      !analyzingIds.value.includes(job.jobId)
    )
    
    if (jobsToAnalyze.length > 0) {
      // 填补并发池
      while (activePromises.length < maxConcurrent && jobsToAnalyze.length > 0) {
        const job = jobsToAnalyze.shift()
        const p = processJob(job).finally(() => {
          activePromises = activePromises.filter(item => item !== p)
        })
        activePromises.push(p)
      }
      
      if (activePromises.length > 0) {
        // 等待任意一个任务完成，腾出并发位
        await Promise.race(activePromises)
      }
    } else {
      if (activePromises.length > 0) {
        // 当前页无剩余待分配任务，等待已有任务全部完成
        await Promise.all(activePromises)
      } else {
        // 当前页全部完成，请求下一页
        if (hasMore.value) {
          try {
            page.value++
            await fetchJobs(true)
            await new Promise(resolve => setTimeout(resolve, 500))
          } catch (e) {
            console.error('加载下一页失败', e)
            break
          }
        } else {
          break
        }
      }
    }
  }
  
  batchAnalyzing.value = false
  if (batchCancelled.value) {
    ElMessage.info(`批量诊断已取消。本次成功: ${successCount}，失败: ${failCount}。`)
  } else if (failCount === 0) {
    ElMessage.success(`批量诊断全部完成！成功诊断 ${successCount} 个职位。`)
  } else {
    ElMessage.warning(`批量诊断结束。成功: ${successCount}，失败: ${failCount}。`)
  }
}

const cancelBatchAiDiagnosis = () => {
  if (!batchAnalyzing.value) return
  batchCancelled.value = true
  ElMessage.warning('正在取消，等待当前任务结束后停止...')
}

const handleBatchOpenUrls = async () => {
  if (batchOpening.value || batchAnalyzing.value) return
  
  if (jobList.value.length === 0 && !hasMore.value) {
    ElMessage.info('没有职位可打开！')
    return
  }

  try {
    await ElMessageBox.confirm(
      `准备开始批量打开原网页。程序会自动向下翻页并打开网页，每次打开间隔 2 秒，标签页会在加载后保留 5 秒自动关闭。是否开始？（随时可点击右上角取消）`,
      '批量打开原网页',
      {
        confirmButtonText: '开始打开',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
  } catch {
    return
  }

  batchOpening.value = true
  batchOpenCancelled.value = false
  let openCount = 0

  while (!batchOpenCancelled.value) {
    const jobsToOpen = jobList.value.filter(job => !job._hasOpened)
    
    if (jobsToOpen.length > 0) {
      const job = jobsToOpen[0]
      job._hasOpened = true
      openCount++

      // 依托页面上的卡片：滚动到该卡片位置
      const cardElement = document.getElementById(`job-card-${job.jobId}`)
      if (cardElement) {
        cardElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }

      const originalUrl = job.normalizedData?.jobUrl || job.jobUrl
      if (originalUrl) {
        const separator = originalUrl.includes('?') ? '&' : '?'
        const autoCloseUrl = originalUrl + separator + 'auto_close=1'
        
      // 发送消息给浏览器扩展，由扩展真正在后台静默打开新标签页
      window.postMessage({ 
        action: 'OPEN_BACKGROUND_TAB', 
        url: autoCloseUrl 
      }, '*')
    }
    
    if (openCount % 20 === 0) {
      const pauseSeconds = Math.floor(Math.random() * (5 * 60 - 3 * 60 + 1)) + 3 * 60;
      ElMessage.warning(`已连续打开 20 个网页，防反爬暂停 ${Math.floor(pauseSeconds / 60)}分${pauseSeconds % 60}秒...`);
      
      for (let i = 0; i < pauseSeconds; i++) {
        if (batchOpenCancelled.value) break;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      if (!batchOpenCancelled.value) {
        ElMessage.success(`暂停结束，继续打开...`);
      }
    } else {
      // 等待 2 秒后再打开下一个
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
    } else {
      if (hasMore.value) {
        try {
          // 自动加载数据：滚动到底部的触发器，依赖 IntersectionObserver 自动加载
          if (loadMoreTrigger.value) {
            loadMoreTrigger.value.scrollIntoView({ behavior: 'smooth', block: 'end' })
          }
          page.value++
          await fetchJobs(true)
          await new Promise(resolve => setTimeout(resolve, 1000))
        } catch (e) {
          console.error('加载下一页失败', e)
          break
        }
      } else {
        break
      }
    }
  }
  
  batchOpening.value = false
  if (batchOpenCancelled.value) {
    ElMessage.info(`批量打开已取消。本次共打开了 ${openCount} 个网页。`)
  } else {
    ElMessage.success(`批量打开全部完成！共打开了 ${openCount} 个网页。`)
  }
}

const cancelBatchOpenUrls = () => {
  if (!batchOpening.value) return
  batchOpenCancelled.value = true
  ElMessage.warning('正在停止...')
}

const copyJobInfo = async (job) => {
  if (!job) return
  try {
    const jobName = job.title || ''
    const companyName = job.normalizedData?.clientCompanyName || job.normalizedData?.brandName || job.companyName || ''
    const experience = job.normalizedData?.experience || '不限'
    const degree = job.normalizedData?.degree || '不限'
    
    // 清理职位描述中的 HTML 标签并保留换行
    const rawDesc = job.normalizedData?.jobDesc || ''
    const desc = String(rawDesc)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?[^>]+(>|$)/g, "")
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      
    const textToCopy = `职位名称：${jobName}\n所属公司：${companyName}\n经验：${experience}\n学历：${degree}\n\n岗位职责与要求：\n${desc}`
    
    await navigator.clipboard.writeText(textToCopy)
    ElMessage.success('职位信息已复制到剪贴板！')
  } catch (err) {
    console.error('复制失败:', err)
    ElMessage.error('复制失败，请重试')
  }
}

const toggleFavorite = async (job) => {
  try {
    const newStatus = !job.isFavorited
    const res = await $fetch(`/api/jobs/${job.id}`, {
      method: 'PUT',
      body: { isFavorited: newStatus }
    })
    if (res && res.success) {
      job.isFavorited = newStatus
      jobList.value = [...jobList.value] // Trigger shallowRef reactivity
      ElMessage.success(newStatus ? '已收藏' : '已取消收藏')
    } else {
      ElMessage.error(res?.error || '操作失败')
    }
  } catch (error) {
    console.error('Toggle favorite error:', error)
    ElMessage.error('收藏操作出现异常')
  }
}

// 批量收藏 / 批量取消收藏
const handleBatchFavorite = async (isFavorited = true) => {
  if (selectedJobIds.value.length === 0) {
    ElMessage.warning('请先勾选需要操作的职位')
    return
  }

  batchFavoriting.value = true
  try {
    const res = await $fetch('/api/jobs/batch', {
      method: 'PUT',
      body: {
        ids: selectedJobIds.value,
        isFavorited: isFavorited
      }
    })
    
    if (res && res.success) {
      ElMessage.success(`已成功批量${isFavorited ? '收藏' : '取消收藏'} ${res.count || selectedJobIds.value.length} 个职位`)
      const updatedSet = new Set(selectedJobIds.value)
      jobList.value.forEach(job => {
        if (updatedSet.has(job.id)) {
          job.isFavorited = isFavorited
        }
      })
      jobList.value = [...jobList.value]
      selectedJobIds.value = []
    } else {
      ElMessage.error(res?.error || res?.message || '批量收藏失败')
    }
  } catch (err) {
    console.error('Batch favorite error:', err)
    ElMessage.error('批量收藏发生异常')
  } finally {
    batchFavoriting.value = false
  }
}

// 批量物理删除
const handleBatchDelete = async () => {
  if (selectedJobIds.value.length === 0) {
    ElMessage.warning('请先勾选需要操作的职位')
    return
  }

  const count = selectedJobIds.value.length
  try {
    await ElMessageBox.confirm(
      `确定要彻底删除已选中的 ${count} 个职位吗？此操作将永久删除数据，不可恢复！`,
      '批量删除确认',
      {
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger'
      }
    )

    batchDeleting.value = true
    const res = await $fetch('/api/jobs/batch', {
      method: 'DELETE',
      body: {
        ids: selectedJobIds.value
      }
    })

    if (res && res.success) {
      ElMessage.success(`已成功删除 ${res.count ?? count} 个职位`)
      const deletedSet = new Set(selectedJobIds.value)
      jobList.value = jobList.value.filter(job => !deletedSet.has(job.id))
      total.value = Math.max(0, total.value - (res.count ?? count))
      selectedJobIds.value = []
    } else {
      ElMessage.error(res?.error || res?.message || '批量删除失败')
    }
  } catch (e) {
    if (e !== 'cancel') {
      console.error('Batch delete error:', e)
      ElMessage.error('批量删除操作出错')
    }
  } finally {
    batchDeleting.value = false
  }
}

const handleAiDiagnosis = async (job) => {
  if (analyzingIds.value.includes(job.jobId)) return
  
  analyzingIds.value.push(job.jobId)
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
    const index = analyzingIds.value.indexOf(job.jobId)
    if (index > -1) analyzingIds.value.splice(index, 1)
  }
}

// 不合适标签弹窗逻辑
const unsuitableModalVisible = ref(false)
const currentTaggingJob = ref(null)
const predefinedTags = ['学历不符', '经验不符', '薪资太低', '外包岗位', '距离太远', '需要外语', '岗位与职责不符']
const selectedTags = ref([])
const customTagInput = ref('')
const savingTags = ref(false)

const openUnsuitableModal = (job) => {
  isBatchUnsuitable.value = false
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

const openBatchUnsuitableModal = () => {
  if (selectedJobIds.value.length === 0) {
    ElMessage.warning('请先勾选需要操作的职位')
    return
  }
  isBatchUnsuitable.value = true
  currentTaggingJob.value = null
  selectedTags.value = []
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
  savingTags.value = true
  try {
    if (isBatchUnsuitable.value) {
      // 批量标记不合适
      if (selectedJobIds.value.length === 0) return
      const res = await $fetch('/api/jobs/batch', {
        method: 'PUT',
        body: {
          ids: selectedJobIds.value,
          isHidden: true,
          tags: selectedTags.value
        }
      })

      if (res && res.success) {
        ElMessage.success(`已成功将 ${res.count || selectedJobIds.value.length} 个职位标记为不合适并隐藏`)
        const hiddenSet = new Set(selectedJobIds.value)

        jobList.value.forEach(job => {
          if (hiddenSet.has(job.id)) {
            job.isHidden = true
            job.tags = [...selectedTags.value]
          }
        })

        if (!filterShowHidden.value) {
          jobList.value = jobList.value.filter(j => !hiddenSet.has(j.id))
        } else {
          jobList.value = [...jobList.value]
        }

        selectedJobIds.value = []
        unsuitableModalVisible.value = false
      } else {
        ElMessage.error(res?.error || res?.message || '批量标记失败')
      }
    } else {
      // 单个标记不合适
      if (!currentTaggingJob.value) return
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
    }
  } catch (error) {
    console.error('Failed to save unsuitable tags:', error)
    ElMessage.error('操作失败')
  } finally {
    savingTags.value = false
  }
}

const handleJobStatusChange = (jobData, status) => {
  if (status === JobStatus.EXPIRED) {
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
  flex-direction: column;
  align-items: stretch;
  background: var(--bg-card, #FFFFFF);
  padding: 14px 20px;
  border-radius: var(--radius-m, 14px);
  box-shadow: var(--shadow-card, 0 4px 24px rgba(0,0,0,0.04));
  margin-bottom: 20px;
  position: sticky;
  top: 0;
  z-index: 100;
  gap: 12px;
}
.toolbar-row {
  display: flex;
  align-items: center;
  width: 100%;
}
.toolbar-row.bottom-row {
  justify-content: space-between;
}
.toolbar h2 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
:deep(.table-card) {
  overflow: visible;
}
:deep(.table-card > .el-card__header) {
  position: sticky;
  top: 0;
  z-index: 100;
  padding: 0;
  border-bottom: none;
  background: transparent;
}
.filters {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  width: 100%;
}
.filters-checkboxes {
  display: flex;
  align-items: center;
  gap: 16px;
}
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
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
.job-card-wide.is-selected {
  border: 1.5px solid var(--primary-color, #007AFF) !important;
  background: #f0f7ff;
}

.job-select-checkbox {
  display: flex;
  align-items: center;
  margin-right: 4px;
}
:deep(.job-select-checkbox .el-checkbox) {
  height: auto;
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
