<template>
  <el-drawer
    v-model="visible"
    :title="job?.title || '职位详情'"
    size="75%"
    destroy-on-close
    class="detail-drawer"
  >
    <template #default>
      <div v-if="job" class="drawer-split-layout">
        <!-- 左侧：岗位详情 -->
        <div class="drawer-left">
          <div class="drawer-left-content">
            <div class="detail-header">
              <h1 class="detail-title">{{ job.title }}</h1>
              <span class="detail-salary">{{ job.salary }}</span>
            </div>
          
            <div class="detail-sub-header">
              <span class="company-text"><el-icon><Building /></el-icon> {{ job.normalizedData?.clientCompanyName || job.normalizedData?.brandName || '-' }}</span>
              <span class="divider">|</span>
              <span class="location-text"><el-icon><MapPin /></el-icon> {{ [job.normalizedData?.city, job.normalizedData?.area, job.normalizedData?.businessDistrict].filter(Boolean).join('·') }}</span>
            </div>
          
            <div class="detail-address" v-if="job.normalizedData?.address">
              <span><el-icon><Map /></el-icon> {{ job.normalizedData.address }}</span>
            </div>

            <div class="detail-badges">
              <el-tag effect="light" type="info" size="large" class="badge-tag"><el-icon><Briefcase /></el-icon> {{ job.normalizedData?.experience || '经验不限' }}</el-tag>
              <el-tag effect="light" type="info" size="large" class="badge-tag"><el-icon><GraduationCap /></el-icon> {{ job.normalizedData?.degree || '学历不限' }}</el-tag>
              <el-tag effect="light" type="info" size="large" class="badge-tag"><el-icon><Globe /></el-icon> {{ job.platform }}</el-tag>
            </div>

            <div class="section-title"><el-icon><BarChart /></el-icon> 岗位概览</div>
            <div class="stats-grid">
              <div class="stat-box"><span class="stat-label">所属行业</span><span class="stat-value">{{ job.normalizedData?.companyIndustry || '-' }}</span></div>
              <div class="stat-box"><span class="stat-label">公司阶段</span><span class="stat-value">{{ job.normalizedData?.companyStage || '-' }}</span></div>
              <div class="stat-box"><span class="stat-label">人员规模</span><span class="stat-value">{{ job.normalizedData?.companyScale || '-' }}</span></div>
              <div class="stat-box"><span class="stat-label">招聘人员</span><span class="stat-value">{{ job.normalizedData?.hrName || '-' }}</span></div>
              <div class="stat-box"><span class="stat-label">招聘职位</span><span class="stat-value">{{ job.normalizedData?.hrPosition || '-' }}</span></div>
              <div class="stat-box"><span class="stat-label">所属公司</span><span class="stat-value">{{ job.normalizedData?.hrCompanyName || '-' }}</span></div>
              <div class="stat-box"><span class="stat-label">发布日期</span><span class="stat-value">{{ job.normalizedData?.publishDate || '-' }}</span></div>
              <div class="stat-box"><span class="stat-label">更新日期</span><span class="stat-value">{{ job.normalizedData?.updateDate || '-' }}</span></div>
              <div class="stat-box"><span class="stat-label">采集日期</span><span class="stat-value">{{ job.normalizedData?.spiderDate || '-' }}</span></div>
            </div>

            <template v-if="job.normalizedData?.welfareList?.length">
              <div class="section-title"><el-icon><Gift /></el-icon> 福利待遇</div>
              <div class="tags-container">
                <el-tag v-for="(tag, idx) in job.normalizedData.welfareList" :key="idx" size="default" type="success" effect="light" class="welfare-tag">{{ tag }}</el-tag>
              </div>
            </template>

            <div class="section-title"><el-icon><FileText /></el-icon> 岗位职责与要求</div>
            <div class="job-desc" style="white-space: pre-wrap;">{{ formatDesc(job.normalizedData?.jobDesc) }}</div>
          
            <template v-if="job.normalizedData?.skills?.length">
              <div class="section-title"><el-icon><Tags /></el-icon> 技能标签</div>
              <div class="tags-container">
                <el-tag v-for="(tag, idx) in job.normalizedData.skills" :key="idx" size="default" type="primary" effect="light" class="welfare-tag">{{ tag }}</el-tag>
              </div>
            </template>

          </div> <!-- End of drawer-left-content -->
          
          <div class="drawer-left-footer">
            <el-button v-if="getJobUrl(job)" type="primary" tag="a" :href="getJobUrl(job)" target="_blank" rel="noopener"><el-icon><ExternalLink /></el-icon>&nbsp;查看原网页</el-button>
            <el-button type="danger" plain @click="markAsExpired(job)" style="margin-left: 12px;" :loading="marking"><el-icon><Ban /></el-icon>&nbsp;标记失效</el-button>
          </div>
          
        </div>

        <!-- 右侧：AI 分析 -->
        <div class="drawer-right">
          <div class="ai-panel">
            <template v-if="job.aiResult">
              <div class="ai-score-card-drawer">
                <el-progress type="dashboard" :percentage="job.aiResult.score || 0" :color="getScoreColor(job.aiResult.score)" :width="100">
                  <template #default="{ percentage }">
                    <span class="ai-score-big">{{ percentage }}分</span>
                  </template>
                </el-progress>
                <div class="ai-score-text">
                  <h3>AI 匹配度评分 <el-tag :type="getScoreColor(job.aiResult.score, true)" size="small" effect="dark" style="margin-left: 5px;">{{ job.aiResult.matchLevel || '-' }}</el-tag></h3>
                  <span class="ai-time">最新评分</span>
                </div>
              </div>

              <div class="ai-section">
                <h4><el-icon><Lightbulb /></el-icon> 详细分析</h4>
                <div class="ai-analysis-content" v-html="formatAiAnalysis(job.aiResult.resultText)"></div>
              </div>

              <div class="ai-section generator-section">
                <h4><el-icon><Sparkles /></el-icon> AI 自我介绍生成</h4>
                <p class="generator-desc">让 AI 为您生成一份专业且有针对性的打招呼语，提高回复率。</p>
                <el-button type="primary" plain class="generate-btn"><el-icon><Rocket /></el-icon>&nbsp;生成自我介绍</el-button>
              </div>
            </template>
            
            <div v-else class="ai-empty">
              <el-empty description="暂无 AI 分析结果" :image-size="80" />
            </div>
          </div>
        </div>
      </div>
    </template>
  </el-drawer>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Building, MapPin, Map, Briefcase, GraduationCap, Globe, BarChart, Gift, FileText, Lightbulb, Sparkles, Rocket, ExternalLink, Tags, Ban } from 'lucide-vue-next'

const emit = defineEmits(['status-changed'])

const visible = ref(false)
const job = ref(null)
const marking = ref(false)

const open = (jobData) => {
  job.value = jobData
  visible.value = true
}

const markAsExpired = async (jobData) => {
  if (!jobData || !jobData.jobId) return
  marking.value = true
  try {
    const res = await $fetch(`/api/jobs/${jobData.id}/status`, {
      method: 'PUT',
      body: { status: 'expired' }
    })
    if (res.success) {
      ElMessage.success('已标记为失效职位')
      visible.value = false
      emit('status-changed', jobData, 'expired')
    } else {
      ElMessage.error(res.message || res.error || '标记失败')
    }
  } catch (err) {
    ElMessage.error('标记失败')
  } finally {
    marking.value = false
  }
}

const getScoreColor = (score, isTag = false) => {
  if (!score) return isTag ? 'info' : '#909399'
  if (score >= 80) return isTag ? 'success' : '#67C23A'
  if (score >= 60) return isTag ? 'warning' : '#E6A23C'
  return isTag ? 'danger' : '#F56C6C'
}

const formatDesc = (desc) => {
  if (!desc) return '暂无描述'
  return String(desc)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?p[^>]*>/gi, '\n')
    .replace(/<\/div>\s*<div[^>]*>/gi, '\n')
    .replace(/<\/?div[^>]*>/gi, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const formatAiAnalysis = (text) => {
  if (!text) return '暂无分析结果'
  let formatted = String(text)
  
  // Headers
  formatted = formatted.replace(/^### (.*?)$/gm, '\n\n<h3>$1</h3>\n\n')
  formatted = formatted.replace(/^## (.*?)$/gm, '\n\n<h2>$1</h2>\n\n')
  formatted = formatted.replace(/^# (.*?)$/gm, '\n\n<h1>$1</h1>\n\n')
  
  // Bold
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  
  // Unordered Lists
  formatted = formatted.replace(/^\s*[-*]\s+(.*?)$/gm, '<li>$1</li>')
  formatted = formatted.replace(/(<li>.*?<\/li>(?:\s*<li>.*?<\/li>)*)/g, (match, p1) => `\n\n<ul>${p1.replace(/\n/g, '')}</ul>\n\n`)
  
  // Numbered lists
  formatted = formatted.replace(/^\s*(\d+)[.、)]\s*(.*?)$/gm, '<li class="num" value="$1">$2</li>')
  formatted = formatted.replace(/(<li class="num"[^>]*>.*?<\/li>(?:\s*<li class="num"[^>]*>.*?<\/li>)*)/g, (match, p1) => `\n\n<ol>${p1.replace(/\n/g, '')}</ol>\n\n`)
  
  // Convert remaining newlines into paragraphs, skipping block elements
  formatted = formatted.split(/\n\s*\n/).map(block => {
    const trimmed = block.trim()
    if (!trimmed) return ''
    if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<ol')) {
      return block
    }
    return `<p>${block.replace(/\n/g, '<br>')}</p>`
  }).join('')
  
  return formatted
}

const getJobUrl = (jobData) => {
  if (!jobData) return ''
  return jobData.normalizedData?.jobUrl || ''
}

defineExpose({
  open
})
</script>

<style scoped>
/* Detailed Drawer Split Layout Styles */
:deep(.el-drawer__body) {
  padding: 0;
  overflow: hidden;
}
.drawer-split-layout {
  display: flex;
  height: 100%;
  background-color: #f8fafc;
}

/* Left Panel */
.drawer-left {
  flex: 3;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #ffffff;
  border-right: 1px solid #e2e8f0;
}
.drawer-left-content {
  flex: 1;
  padding: 24px 32px;
  overflow-y: auto;
}
.drawer-left-footer {
  padding: 16px 32px;
  background: #ffffff;
  border-top: 1px solid #ebeef5;
  box-shadow: 0 -4px 12px rgba(0,0,0,0.02);
  display: flex;
  justify-content: flex-start;
}
.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}
.detail-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #1e293b;
  line-height: 1.3;
}
.detail-salary {
  font-size: 22px;
  font-weight: bold;
  color: #0088fb;
  white-space: nowrap;
}
.detail-sub-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  color: #475569;
  font-weight: 500;
  margin-bottom: 8px;
}
.detail-address {
  font-size: 14px;
  color: #64748b;
  margin-bottom: 16px;
}
.detail-badges {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 24px;
}
.badge-tag {
  background: #f1f5f9;
  border: none;
  color: #475569;
  border-radius: 6px;
  font-weight: 500;
}

/* Stats Grid */
.section-title {
  font-size: 16px;
  font-weight: bold;
  color: #1e293b;
  margin: 24px 0 16px 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  background: #f8fafc;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}
.stat-box {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stat-label {
  font-size: 13px;
  color: #64748b;
}
.stat-value {
  font-size: 14px;
  color: #1e293b;
  font-weight: 500;
}

/* Tags and Description */
.tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.welfare-tag {
  border-radius: 6px;
}
.job-desc {
  font-size: 15px;
  line-height: 1.8;
  color: #334155;
  background: #f8fafc;
  padding: 20px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

/* Right Panel (AI) */
.drawer-right {
  flex: 2;
  padding: 24px;
  overflow-y: auto;
  background: #f8fafc;
}
.ai-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.ai-score-card-drawer {
  background: #ffffff;
  padding: 20px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  gap: 24px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
.ai-score-big {
  font-size: 20px;
  font-weight: bold;
}
.ai-score-text h3 {
  margin: 0 0 8px 0;
  font-size: 16px;
  color: #1e293b;
  display: flex;
  align-items: center;
}
.ai-time {
  font-size: 13px;
  color: #64748b;
}

.ai-section {
  background: #ffffff;
  padding: 20px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
.ai-section h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
  color: #1e293b;
  display: flex;
  align-items: center;
  gap: 6px;
}
.ai-analysis-content {
  font-size: 14px;
  line-height: 1.6;
  color: #475569;
}
.ai-analysis-content ul, .ai-analysis-content ol {
  padding-left: 20px;
  margin: 8px 0;
}
.ai-analysis-content p {
  margin: 8px 0;
}

.generator-section {
  display: flex;
  flex-direction: column;
}
.generator-desc {
  font-size: 13px;
  color: #64748b;
  margin-bottom: 16px;
}
.generate-btn {
  width: 100%;
  font-weight: bold;
}
.ai-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
