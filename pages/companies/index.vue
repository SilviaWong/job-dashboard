<template>
  <div class="companies-page">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span style="font-size: 18px; font-weight: 600;">🏢 企业全景</span>
          <div style="display: flex; gap: 16px; align-items: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 14px; color: #606266;">职位状态:</span>
              <el-radio-group v-model="status" size="small" @change="() => fetchCompanies(false)">
                <el-radio-button value="all">全部</el-radio-button>
                <el-radio-button value="normal">常规</el-radio-button>
              </el-radio-group>
            </div>
            <el-input
              v-model="searchQuery"
              placeholder="搜索公司名称..."
              style="width: 300px"
              clearable
            >
              <template #prefix>
                <span>🔍</span>
              </template>
            </el-input>
            <el-button type="primary" size="small" @click="() => fetchCompanies(false)" :loading="loading">
              刷新数据
            </el-button>
          </div>
        </div>
      </template>

      <div v-loading="loading && page === 1">
        <div style="margin-bottom: 15px; color: #606266; font-size: 14px;">
          共收录 <strong>{{ totalCompanies }}</strong> 家公司
        </div>
        
        <el-collapse v-if="companies.length > 0">
          <el-collapse-item 
            v-for="company in companies" 
            :key="company.companyName"
            :name="company.companyName"
          >
            <template #title>
              <div class="company-title-wrapper">
                <div class="company-title">
                  <span class="company-name">{{ company.companyName }}</span>
                  <el-tag size="small" type="info" v-if="company.rawData?.industry">
                    {{ company.rawData.industry }}
                  </el-tag>
                  <el-tag size="small" type="success" v-if="company.rawData?.scale">
                    {{ company.rawData.scale }}
                  </el-tag>
                  <el-tag size="small" type="warning" v-if="company.rawData?.stage">
                    {{ company.rawData.stage }}
                  </el-tag>
                  <el-tag size="small" type="success" effect="dark" style="margin-left: 10px;">
                    共 {{ company.jobs?.length || 0 }} 个职位
                  </el-tag>
                </div>
                
                <div class="platform-tags">
                  <el-tag 
                    v-for="plat in company.platformSources" 
                    :key="plat" 
                    size="small"
                    :type="getPlatformType(plat)"
                    effect="dark"
                  >
                    {{ plat }}
                  </el-tag>
                </div>
              </div>
            </template>
            
            <div class="company-content">
              <div class="company-info-section" v-if="company.rawData?.companyDesc || company.rawData?.welfare?.length">
                <div v-if="company.rawData?.companyDesc">
                  <h4 style="margin-top: 5px;">公司介绍</h4>
                  <p class="company-desc">{{ company.rawData.companyDesc }}</p>
                </div>
                
                <div v-if="company.rawData?.welfare?.length" class="company-welfare">
                  <h4>公司福利</h4>
                  <el-tag 
                    v-for="(w, idx) in company.rawData.welfare" 
                    :key="idx" 
                    size="small" 
                    type="success"
                    effect="light"
                    style="margin-right: 8px; margin-bottom: 8px;"
                  >
                    {{ w }}
                  </el-tag>
                </div>
              </div>

              <!-- 职位网格 (Job Grid) -->
              <div class="job-card-grid" v-if="company.jobs && company.jobs.length > 0">
                <div class="job-card" :class="{ 'is-expired': job.status === 'expired' || job.status === 'closed', 'is-hidden': job.isHidden }" v-for="job in company.jobs" :key="job.jobId" @click="viewDetails(job)">
                  <div class="job-card-header">
                    <h3 class="job-title" :title="job.title">
                      {{ job.title }}
                    </h3>
                    <div class="job-salary-score">
                      <span class="job-salary">{{ job.salary }}</span>
                      <span v-if="job.aiResult" class="inline-score-badge" :style="getScoreStyle(job.aiResult.score)">
                        <el-icon style="margin-right: 4px; font-size: 13px;"><Bot /></el-icon>{{ job.aiResult.score }}分 · {{ job.aiResult.matchLevel }}
                      </span>
                    </div>
                  </div>
                  
                  <div class="job-card-info">
                    {{ [job.normalizedData?.city, job.normalizedData?.area].filter(Boolean).join('·') }} | {{ job.normalizedData?.experience || '不限' }} | {{ job.normalizedData?.degree || '不限' }}
                  </div>
                  
                  <div class="job-card-tags" v-if="(job.tags && job.tags.length > 0) || job.status === 'expired' || job.status === 'closed' || job.isHidden || job.normalizedData?.isHeadhunter">
                    <el-tag v-if="job.status === 'expired' || job.status === 'closed'" size="small" type="danger" effect="dark" style="border: none; padding: 0 6px; height: 20px; line-height: 20px;">失效</el-tag>
                    <el-tag v-if="job.isHidden" size="small" type="info" effect="dark" style="border: none; padding: 0 6px; height: 20px; line-height: 20px;">不合适</el-tag>
                    <el-tag v-if="job.normalizedData?.isHeadhunter" size="small" color="#fce4ec" style="color: #c2185b; border: 1px solid #f8bbd0; padding: 0 6px; height: 20px; line-height: 20px;">
                      代招公司<span v-if="job.normalizedData?.clientCompanyName">：{{ job.normalizedData.clientCompanyName }}</span>
                    </el-tag>
                    <span class="job-tag" v-for="(t, idx) in job.tags" :key="idx">{{ t }}</span>
                  </div>
                  
                  <div class="job-card-footer">
                    <div class="job-hr">
                      <span v-if="job.normalizedData?.hrName">{{ job.normalizedData.hrName }}</span>
                      <span v-if="job.normalizedData?.hrPosition">{{ job.normalizedData.hrName ? ' · ' : '' }}{{ job.normalizedData.hrPosition }}</span>
                    </div>
                    <div class="job-meta" style="display: flex; align-items: center; gap: 8px;">
                      <span class="job-date">{{ formatDate(job.normalizedData?.updateDate) }}</span>
                      <el-tag size="small" :type="getPlatformType(job.platform)">{{ job.platform }}</el-tag>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </el-collapse-item>
        </el-collapse>
        <el-empty v-else-if="!loading" description="没有找到匹配的企业数据" />
        
        <!-- Intersection Observer Trigger -->
        <div ref="loadMoreTrigger" class="observer-trigger" style="height: 10px; width: 100%;"></div>

        <div v-if="loading && page > 1" class="loading-more" style="text-align: center; padding: 15px; color: #909399;">
          <el-icon class="is-loading"><Loader2 /></el-icon> 正在加载更多数据...
        </div>
        <div v-if="!hasMore && companies.length > 0" class="no-more" style="text-align: center; padding: 15px; color: #909399; font-size: 14px;">
          已经到底啦 ~
        </div>
      </div>
    </el-card>

    <JobDetailDrawer ref="jobDetailDrawerRef" @status-changed="handleJobStatusChange" />
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Loader2, Bot } from 'lucide-vue-next'

const loading = ref(false)
const companies = ref([])
const totalCompanies = ref(0)
const searchQuery = ref('')
const page = ref(1)
const pageSize = ref(12)
const hasMore = ref(true)
const status = ref('normal')

const jobDetailDrawerRef = ref(null)

const loadMoreTrigger = ref(null)
let observer = null

const getPlatformType = (plat) => {
  if (!plat) return 'info'
  if (plat.includes('Boss')) return 'success'
  if (plat.includes('51job')) return 'warning'
  if (plat.includes('猎聘')) return 'danger'
  if (plat.includes('智联')) return 'primary'
  return 'info'
}

// 格式化日期
const formatDate = (dateStr) => {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric'
    })
  } catch (e) {
    return dateStr
  }
}

const getScoreStyle = (score) => {
  if (!score) return { backgroundColor: '#fee2e2', color: '#b91c1c', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }
  if (score >= 80) return { backgroundColor: '#dcfce3', color: '#15803d', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' } // High match (Green)
  if (score >= 60) return { backgroundColor: '#ffedd5', color: '#c2410c', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' } // Mid match (Orange)
  return { backgroundColor: '#fee2e2', color: '#b91c1c', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' } // Low match (Red)
}

const viewDetails = (job) => {
  if (jobDetailDrawerRef.value) {
    jobDetailDrawerRef.value.open(job)
  }
}

const handleJobStatusChange = (jobData, status) => {
  if (status === 'expired') {
    // 更新状态而不是移除它，使其能显示为灰色失效状态
    companies.value.forEach(company => {
      if (company.jobs) {
        const job = company.jobs.find(j => j.jobId === jobData.jobId)
        if (job) {
          job.status = 'expired'
        }
      }
    })
  }
}

const fetchCompanies = async (isLoadMore = false) => {
  if (loading.value) return
  
  if (!isLoadMore) {
    page.value = 1
    hasMore.value = true
  }

  loading.value = true
  try {
    const res = await $fetch('/api/companies', {
      params: {
        page: page.value,
        pageSize: pageSize.value,
        query: searchQuery.value,
        status: status.value
      }
    })
    if (res.success) {
      if (isLoadMore) {
        companies.value.push(...res.data)
      } else {
        companies.value = res.data
      }
      totalCompanies.value = res.total || 0
      
      if (res.data.length < pageSize.value) {
        hasMore.value = false
      }
    }
  } catch (error) {
    ElMessage.error('获取公司数据失败')
  } finally {
    loading.value = false
  }
}

const loadMore = () => {
  if (!loading.value && hasMore.value) {
    page.value++
    fetchCompanies(true)
  }
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

// Debounce search query
let searchTimeout = null
watch(searchQuery, () => {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    fetchCompanies(false)
  }, 500)
})

onMounted(() => {
  fetchCompanies(false)
})

onUnmounted(() => {
  if (observer) {
    observer.disconnect()
  }
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.company-title-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding-right: 15px;
}
.company-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.platform-tags {
  display: flex;
  gap: 5px;
}
.company-name {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}
.company-content {
  padding: 10px 15px;
}
.company-info-section {
  background-color: #f8f9fa;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
}
.company-desc {
  color: #606266;
  line-height: 1.6;
  white-space: pre-wrap;
  font-size: 14px;
}
.company-welfare h4, .company-info-section h4 {
  margin-top: 15px;
  margin-bottom: 10px;
  color: #303133;
}

/* 职位卡片网格样式 */
.job-card-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}
.job-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  transition: transform 0.2s, box-shadow 0.2s;
  cursor: pointer;
}
.job-card.is-expired,
.job-card.is-hidden {
  background-color: #f8fafc;
  border-color: #e2e8f0;
}
.job-card.is-expired .job-title,
.job-card.is-expired .job-salary,
.job-card.is-expired .job-card-info,
.job-card.is-expired .job-date,
.job-card.is-hidden .job-title,
.job-card.is-hidden .job-salary,
.job-card.is-hidden .job-card-info,
.job-card.is-hidden .job-date {
  color: #94a3b8 !important;
}
.job-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}
.job-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}
.job-title {
  font-size: 17px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 250px;
}
.job-salary-score {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
}
.inline-score-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
  display: flex;
  align-items: center;
  white-space: nowrap;
}
.job-salary {
  font-size: 16px;
  font-weight: bold;
  color: #f56c6c;
}
.job-card-info {
  font-size: 14px;
  color: #64748b;
  margin-bottom: 12px;
}
.job-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
.job-tag {
  background: #f1f5f9;
  color: #475569;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}
.job-card-footer {
  margin-top: auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid #f1f5f9;
}
.job-hr {
  font-size: 13px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 55%;
}
.job-date {
  font-size: 12px;
  color: #94a3b8;
}
</style>
