<template>
  <div class="companies-page">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <div style="display: flex; align-items: center; gap: 14px;">
            <span style="font-size: 18px; font-weight: 600;">🏢 企业全景</span>
            <!-- 企业横向对比按钮 -->
            <el-badge :value="comparedCompanies.length" :hidden="comparedCompanies.length === 0" type="danger">
              <el-button 
                type="warning" 
                size="small" 
                :disabled="comparedCompanies.length < 2"
                @click="openCompareModal"
              >
                ⚖️ 横向对比 ({{ comparedCompanies.length }}/4)
              </el-button>
            </el-badge>
            <el-button v-if="comparedCompanies.length > 0" size="small" text type="info" @click="clearCompared">
              清空对比
            </el-button>
          </div>

          <div style="display: flex; gap: 14px; align-items: center; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 14px; color: #606266;">类型:</span>
              <el-radio-group v-model="agencyFilter" size="small" @change="() => fetchCompanies(false)">
                <el-radio-button value="direct">直招</el-radio-button>
                <el-radio-button value="agency">代招</el-radio-button>
                <el-radio-button value="all">全部</el-radio-button>
              </el-radio-group>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 14px; color: #606266;">职位状态:</span>
              <el-radio-group v-model="status" size="small" @change="() => fetchCompanies(false)">
                <el-radio-button value="all">全部</el-radio-button>
                <el-radio-button value="normal">常规</el-radio-button>
              </el-radio-group>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 14px; color: #606266;">平台:</span>
              <el-select v-model="platformFilter" size="small" style="width: 110px;" @change="() => fetchCompanies(false)">
                <el-option label="全部" value="all" />
                <el-option label="Boss直聘" value="Boss直聘" />
                <el-option label="前程无忧" value="51job" />
                <el-option label="猎聘" value="猎聘" />
                <el-option label="智联招聘" value="智联" />
              </el-select>
            </div>
            <el-input
              v-model="searchQuery"
              placeholder="搜索公司名称..."
              style="width: 260px"
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
        <div style="margin-bottom: 15px; color: #606266; font-size: 14px; display: flex; justify-content: space-between; align-items: center;">
          <span>共收录 <strong>{{ totalCompanies }}</strong> 家公司</span>
          <span style="font-size: 12px; color: #94a3b8;">提示：勾选企业标题左侧的多选框，可选择 2~4 家企业进行多维度横向对比</span>
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
                  <!-- 对比复选框 -->
                  <el-checkbox
                    :model-value="isCompanyCompared(company)"
                    @change="(val) => toggleCompareCompany(company, val)"
                    @click.stop
                    style="margin-right: 10px;"
                    title="勾选加入企业横向对比 (最多4家)"
                  />
                  <span class="company-name" :class="{'is-agency-name': company.isAgency}">{{ company.companyName }}</span>
                  <el-switch
                    v-model="company.isAgency"
                    inline-prompt
                    active-text="代招/猎头"
                    inactive-text="直招"
                    style="margin-left: 10px; margin-right: 10px;"
                    @change="toggleAgency(company)"
                    @click.stop
                  />
                  <el-tag size="small" type="info" v-if="company.industry || company.rawData?.industry">
                    {{ company.industry || company.rawData?.industry }}
                  </el-tag>
                  <el-tag size="small" type="success" v-if="company.scale || company.rawData?.scale">
                    {{ company.scale || company.rawData?.scale }}
                  </el-tag>
                  <el-tag size="small" type="success" effect="dark" style="margin-left: 10px;">
                    共 {{ company.jobs?.length || 0 }} 个职位
                  </el-tag>
                </div>
                
                <div class="company-header-actions" @click.stop>
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
                  <!-- 打开画像与趋势弹窗 -->
                  <el-button
                    size="small"
                    type="primary"
                    plain
                    round
                    style="margin-left: 10px;"
                    @click.stop="openAnalyticsModal(company)"
                  >
                    📈 招聘画像与趋势
                  </el-button>
                </div>
              </div>
            </template>
            
            <div class="company-content">
              <!-- 企业简明招聘雷达条 -->
              <div class="company-quick-radar">
                <div class="radar-item">
                  <span class="radar-label">招聘热度</span>
                  <span class="radar-val" :style="{ color: getCompanyHeat(company).color }">
                    {{ getCompanyHeat(company).score }}分 · {{ getCompanyHeat(company).text }}
                  </span>
                </div>
                <div class="radar-divider"></div>
                <div class="radar-item">
                  <span class="radar-label">近30天新发</span>
                  <span class="radar-val">{{ getCompanyRecent30d(company) }} 岗</span>
                </div>
                <div class="radar-divider"></div>
                <div class="radar-item">
                  <span class="radar-label">预估薪资</span>
                  <span class="radar-val">{{ getCompanySalary(company) }}</span>
                </div>
                <el-button 
                  size="small" 
                  type="primary" 
                  link 
                  style="margin-left: auto;" 
                  @click.stop="openAnalyticsModal(company)"
                >
                  查看月度趋势折线与技能画像 →
                </el-button>
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

    <!-- 模态框组件 -->
    <JobDetailDrawer ref="jobDetailDrawerRef" @status-changed="handleJobStatusChange" />
    <CompanyCompareModal ref="compareModalRef" />
    <CompanyAnalyticsModal ref="analyticsModalRef" />
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Loader2, Bot } from 'lucide-vue-next'
import { parseSalary } from '~/utils/companyAnalytics'

const loading = ref(false)
const companies = ref([])
const totalCompanies = ref(0)
const searchQuery = ref('')
const page = ref(1)
const pageSize = ref(12)
const hasMore = ref(true)
const status = ref('normal')
const agencyFilter = ref('direct')
const platformFilter = ref('all')

const jobDetailDrawerRef = ref(null)
const compareModalRef = ref(null)
const analyticsModalRef = ref(null)

// 企业横向对比状态
const comparedCompanies = ref([])

const isCompanyCompared = (company) => {
  return comparedCompanies.value.some(c => c.companyName === company.companyName)
}

const toggleCompareCompany = (company, checked) => {
  if (checked) {
    if (comparedCompanies.value.length >= 4) {
      ElMessage.warning('最多同时选择 4 家企业进行对比')
      return
    }
    if (!isCompanyCompared(company)) {
      comparedCompanies.value.push(company)
      ElMessage.success(`已添加「${company.companyName}」至对比池 (${comparedCompanies.value.length}/4)`)
    }
  } else {
    comparedCompanies.value = comparedCompanies.value.filter(c => c.companyName !== company.companyName)
  }
}

const clearCompared = () => {
  comparedCompanies.value = []
}

const openCompareModal = () => {
  if (comparedCompanies.value.length < 2) {
    ElMessage.warning('请勾选至少 2 家企业进行横向对比')
    return
  }
  if (compareModalRef.value) {
    compareModalRef.value.open(comparedCompanies.value)
  }
}

const openAnalyticsModal = (company) => {
  if (analyticsModalRef.value) {
    analyticsModalRef.value.open(company)
  }
}

// 快速雷达指标辅助函数
const getCompanyRecent30d = (company) => {
  const jobs = company.jobs || []
  const ms30d = 30 * 24 * 60 * 60 * 1000
  const now = Date.now()
  return jobs.filter(j => {
    const t = j.firstSeen ? new Date(j.firstSeen).getTime() : (j.createdAt ? new Date(j.createdAt).getTime() : now)
    return (now - t) <= ms30d
  }).length
}

const getCompanyHeat = (company) => {
  const jobs = company.jobs || []
  if (!jobs.length) return { score: 0, text: '无在招', color: '#94a3b8' }
  const recent30d = getCompanyRecent30d(company)
  const score = Math.min(100, Math.round((recent30d / jobs.length) * 100))
  if (score >= 60) return { score, text: '扩招旺季', color: '#ea580c' }
  if (score >= 30) return { score, text: '平稳补招', color: '#16a34a' }
  return { score, text: '招聘放缓', color: '#64748b' }
}

const getCompanySalary = (company) => {
  const jobs = company.jobs || []
  const valid = []
  for (const j of jobs) {
    const { minK, maxK } = parseSalary(j.salary)
    if (minK !== null && maxK !== null) {
      valid.push({ minK, maxK })
    }
  }
  if (!valid.length) return '面议'
  const avgMin = Math.round(valid.reduce((acc, s) => acc + s.minK, 0) / valid.length)
  const avgMax = Math.round(valid.reduce((acc, s) => acc + s.maxK, 0) / valid.length)
  return `${avgMin}~${avgMax}K`
}

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

const toggleAgency = async (company) => {
  try {
    const res = await $fetch('/api/companies/agency', {
      method: 'PUT',
      body: {
        companyName: company.companyName,
        isAgency: company.isAgency
      }
    })
    if (res.success) {
      ElMessage.success('更新成功')
      if (agencyFilter.value !== 'all') {
        fetchCompanies(false)
      }
    } else {
      ElMessage.error(res.error || '更新失败')
      company.isAgency = !company.isAgency
    }
  } catch (error) {
    console.error('Failed to toggle agency:', error)
    ElMessage.error('更新失败')
    company.isAgency = !company.isAgency
  }
}

const fetchCompanies = async (isLoadMore = false) => {
  if (!isLoadMore) {
    page.value = 1
    hasMore.value = true
  }

  if (!hasMore.value) return

  loading.value = true
  try {
    const res = await $fetch('/api/companies', {
      params: {
        page: page.value,
        pageSize: pageSize.value,
        query: searchQuery.value,
        status: status.value,
        agencyFilter: agencyFilter.value,
        platformFilter: platformFilter.value
      }
    })

    if (res.success) {
      if (isLoadMore) {
        companies.value = [...companies.value, ...res.data]
      } else {
        companies.value = res.data
      }
      totalCompanies.value = res.total
      
      if (companies.value.length >= res.total) {
        hasMore.value = false
      }
    }
  } catch (error) {
    console.error('Failed to fetch companies:', error)
    ElMessage.error('获取企业数据失败')
  } finally {
    loading.value = false
  }
}

// 搜索防抖
let searchTimeout = null
watch(searchQuery, () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    fetchCompanies(false)
  }, 300)
})

// Setup intersection observer for infinite scrolling
onMounted(() => {
  fetchCompanies()

  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && hasMore.value && !loading.value) {
      page.value++
      fetchCompanies(true)
    }
  }, {
    threshold: 0.1
  })

  if (loadMoreTrigger.value) {
    observer.observe(loadMoreTrigger.value)
  }
})

onUnmounted(() => {
  if (observer) {
    observer.disconnect()
  }
})
</script>

<style scoped>
.companies-page {
  padding: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.company-title-wrapper {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding-right: 15px;
}

.company-title {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.company-name {
  font-weight: 600;
  font-size: 16px;
  color: #303133;
}

.is-agency-name {
  color: #c2185b;
}

.company-header-actions {
  display: flex;
  align-items: center;
}

.platform-tags {
  display: flex;
  gap: 6px;
}

/* Quick Radar Bar */
.company-quick-radar {
  background: #f8fafc;
  border-radius: 8px;
  padding: 10px 16px;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.radar-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.radar-label {
  font-size: 12px;
  color: #64748b;
}

.radar-val {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
}

.radar-divider {
  width: 1px;
  height: 14px;
  background: #cbd5e1;
}

.company-content {
  padding: 10px 0;
}


.job-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.job-card {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  background-color: #fff;
  display: flex;
  flex-direction: column;
}

.job-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  border-color: #cbd5e1;
}

.job-card.is-expired {
  opacity: 0.6;
  background-color: #fafafa;
}

.job-card.is-hidden {
  opacity: 0.5;
  background-color: #f5f5f5;
  border-style: dashed;
}

.job-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.job-title {
  font-size: 16px;
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
