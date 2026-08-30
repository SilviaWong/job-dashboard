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
              <el-tag effect="light" type="info" size="large" class="badge-tag"><el-icon><Globe /></el-icon> {{ job.platform }}</el-tag>
              <el-tag effect="light" type="info" size="large" class="badge-tag"><el-icon><Briefcase /></el-icon> {{ job.normalizedData?.experience || '经验不限' }}</el-tag>
              <el-tag effect="light" type="info" size="large" class="badge-tag"><el-icon><GraduationCap /></el-icon> {{ job.normalizedData?.degree || '学历不限' }}</el-tag>
              <el-tag v-if="job.normalizedData?.isHeadhunter" effect="light" size="large" class="badge-tag" style="background-color: #fce4ec; color: #c2185b; border: 1px solid #f8bbd0;">
                <el-icon><UserCheck /></el-icon>&nbsp;猎头/代招岗位
              </el-tag>
              <el-tag v-if="effectiveHr.level === 'zombie'" effect="dark" type="danger" size="large" class="badge-tag" style="background-color: #ef4444; border-color: #ef4444;" :title="effectiveHr.tooltip">
                {{ effectiveHr.badgeText }}
              </el-tag>
              <el-tag v-else-if="effectiveHr.level === 'active'" effect="light" type="success" size="large" class="badge-tag" :title="effectiveHr.tooltip">
                {{ effectiveHr.badgeText }}
              </el-tag>
              <el-tag v-else-if="effectiveHr.level === 'moderate'" effect="light" type="info" size="large" class="badge-tag" :title="effectiveHr.tooltip">
                {{ effectiveHr.badgeText }}
              </el-tag>
              <el-tag v-else-if="effectiveHr.level === 'stale'" effect="plain" type="info" size="large" class="badge-tag" style="color: #94a3b8; border-color: #cbd5e1;" :title="effectiveHr.tooltip">
                {{ effectiveHr.badgeText }}
              </el-tag>
            </div>

            <!-- 僵尸岗位警示提示条 -->
            <el-alert
              v-if="effectiveHr.level === 'zombie'"
              :title="effectiveHr.tooltip"
              type="warning"
              show-icon
              :closable="false"
              style="margin-bottom: 16px; border-radius: 8px;"
            />

            <!-- HR活跃状态失效提示条 -->
            <el-alert
              v-else-if="effectiveHr.level === 'stale'"
              :title="effectiveHr.tooltip"
              type="info"
              show-icon
              :closable="false"
              style="margin-bottom: 16px; border-radius: 8px; background-color: #f8fafc; border: 1px solid #e2e8f0; color: #64748b;"
            />

            <div class="section-title"><el-icon><BarChart /></el-icon> 岗位概览</div>
            <div class="stats-grid">
              <div class="stat-box"><span class="stat-label">所属行业</span><span class="stat-value">{{ job.normalizedData?.companyIndustry || '-' }}</span></div>
              <div class="stat-box"><span class="stat-label">公司阶段</span><span class="stat-value">{{ job.normalizedData?.companyStage || '-' }}</span></div>
              <div class="stat-box"><span class="stat-label">人员规模</span><span class="stat-value">{{ job.normalizedData?.companyScale || '-' }}</span></div>
              <div class="stat-box"><span class="stat-label">招聘人员</span><span class="stat-value">{{ job.normalizedData?.hrName || '-' }}</span></div>
              <div class="stat-box"><span class="stat-label">招聘职位</span><span class="stat-value">{{ job.normalizedData?.hrPosition || '-' }}</span></div>
              <div class="stat-box" v-if="job.normalizedData?.hrCompanyName"><span class="stat-label">所属公司</span><span class="stat-value" :title="job.normalizedData.hrCompanyName">{{ job.normalizedData.hrCompanyName }}</span></div>
              <div class="stat-box">
                <span class="stat-label">HR活跃度</span>
                <span 
                  class="stat-value" 
                  :title="effectiveHr.tooltip"
                  :style="{ 
                    color: effectiveHr.level === 'zombie' ? '#ef4444' : (effectiveHr.level === 'active' ? '#10b981' : (effectiveHr.level === 'stale' ? '#94a3b8' : '#64748b')), 
                    fontWeight: effectiveHr.level === 'zombie' ? '600' : 'normal' 
                  }"
                >
                  {{ effectiveHr.displayStatus }}
                </span>
              </div>
              <div class="stat-box"><span class="stat-label">发布日期</span><span class="stat-value">{{ formatDrawerDate(job.platformPublishTime || job.normalizedData?.publishDate) }}</span></div>
              <div class="stat-box"><span class="stat-label">更新日期</span><span class="stat-value">{{ formatDrawerDate(job.platformUpdateTime || job.normalizedData?.updateDate) }}</span></div>
              <div class="stat-box"><span class="stat-label">首次收录</span><span class="stat-value">{{ formatDrawerDate(job.firstSeen) }}</span></div>
              <div class="stat-box"><span class="stat-label">最近活跃</span><span class="stat-value">{{ formatDrawerDate(job.lastSeen) }}</span></div>
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
            <el-button type="danger" :plain="!job.isBlacklisted" @click="handleToggleBlacklist(job)" style="margin-left: 12px;"><el-icon><ShieldBan /></el-icon>&nbsp;{{ job.isBlacklisted ? '已拉黑企业' : '拉黑该企业' }}</el-button>
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

              <div class="ai-section" style="margin-bottom: 20px;">
                <h4><el-icon><Lightbulb /></el-icon> 详细分析</h4>
                <div class="ai-analysis-content" v-html="formatAiAnalysis(job.aiResult.resultText)"></div>
              </div>
            </template>
            
            <div v-else class="ai-empty" style="margin-bottom: 20px; background: white; border-radius: 12px; border: 1px solid #e2e8f0; padding: 20px;">
              <el-empty description="暂无综合匹配度分析，可点击下方按钮独立生成预测" :image-size="80" />
            </div>

            <div class="ai-section generator-section" style="margin-bottom: 20px;">
              <h4><el-icon><Target /></el-icon> 🎯 面试题目预测</h4>
              <div v-if="job.aiResult && job.aiResult.predictedQuestions" class="ai-analysis-content" v-html="formatAiAnalysis(job.aiResult.predictedQuestions)"></div>
              <template v-else>
                <p class="generator-desc">结合岗位 JD 和您的简历，预测可能被问到的高频面试题。</p>
                <el-button type="warning" plain class="generate-btn" :loading="predicting" @click="generatePredictions"><el-icon><Sparkles /></el-icon>&nbsp;一键生成面试预测</el-button>
              </template>
            </div>

            <div class="ai-section generator-section" style="margin-bottom: 20px;">
              <h4><el-icon><Sparkles /></el-icon> 🤖 AI 定制打招呼语</h4>
              <div v-if="job.aiResult && job.aiResult.intro">
                <div class="ai-analysis-content" v-html="formatAiAnalysis(job.aiResult.intro)"></div>
                <div style="margin-top: 15px; display: flex; gap: 10px;">
                  <el-button size="small" @click="copyIntro"><el-icon><Copy /></el-icon>&nbsp;复制打招呼语</el-button>
                  <el-button size="small" type="primary" plain :loading="generatingGreeting" @click="generateGreeting"><el-icon><RefreshCw /></el-icon>&nbsp;重新生成</el-button>
                </div>
              </div>
              <template v-else>
                <p class="generator-desc">基于您的个人简历画像与当前岗位 JD，一键定制专属、高回复率的求职打招呼语。</p>
                <el-button type="primary" plain class="generate-btn" :loading="generatingGreeting" @click="generateGreeting"><el-icon><Rocket /></el-icon>&nbsp;🤖 一键生成定制打招呼语</el-button>
              </template>
            </div>

            <!-- 统一 AI 技能箱 这个功能先屏蔽掉：目前功能还未完善，效果不好-->
            <!-- <div class="ai-section generator-section">
              <h4><el-icon><Sparkles /></el-icon> ✨ AI 技能箱</h4>
              <p class="generator-desc">基于统一大模型配置和您的简历，一键调用求职 Agent 技能。</p>
              
              <div class="skills-grid" style="display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap;">
                <el-button 
                  v-for="skill in availableSkills" 
                  :key="skill.id"
                  type="primary" 
                  plain 
                  :loading="runningSkill === skill.id"
                  @click="executeSkill(skill)"
                >
                  <el-icon><Sparkles /></el-icon>&nbsp;{{ skill.name }}
                </el-button>
              </div> -->

              <!-- 技能结果展示区 -->
              <!-- <div v-if="activeSkillResult" class="skill-result-box" style="margin-top: 15px; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
                <h5 style="margin: 0 0 10px 0; display: flex; justify-content: space-between; align-items: center;">
                  <span>执行结果：{{ activeSkillName }}</span>
                  <el-button size="small" @click="copySkillResult"><el-icon><Copy /></el-icon>&nbsp;复制内容</el-button>
                </h5>
                <div class="ai-analysis-content" v-html="formatAiAnalysis(activeSkillResult)"></div>
              </div>
            </div> -->
          </div>
        </div>
      </div>
    </template>
  </el-drawer>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { JobStatus } from '~/utils/enums'
import { Building, MapPin, Map, Briefcase, GraduationCap, Globe, BarChart, Gift, FileText, Lightbulb, Sparkles, Rocket, ExternalLink, Tags, Ban, Target, Copy, RefreshCw, ShieldBan, UserCheck } from 'lucide-vue-next'

const emit = defineEmits(['status-changed'])

const visible = ref(false)
const job = ref(null)
const marking = ref(false)
const predicting = ref(false)
const generatingGreeting = ref(false)

const effectiveHr = computed(() => {
  return getEffectiveHrActive(job.value)
})

const formatDrawerDate = (d) => {
  if (!d) return '-'
  const date = new Date(d)
  if (isNaN(date.getTime())) return String(d)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const generatePredictions = async () => {
  if (!job.value || !job.value.jobId) return
  
  predicting.value = true
  try {
    const res = await $fetch('/api/jobs/predict-questions', {
      method: 'POST',
      body: { jobId: job.value.jobId }
    })
    
    if (res && res.success && res.data) {
      ElMessage.success('面试预测生成成功！')
      job.value.aiResult = res.data
    } else {
      ElMessage.error(res?.error || '生成失败，请检查配置')
    }
  } catch (error) {
    console.error('Prediction failed:', error)
    ElMessage.error('服务调用异常')
  } finally {
    predicting.value = false
  }
}

const generateGreeting = async () => {
  if (!job.value || !job.value.jobId) return
  
  generatingGreeting.value = true
  try {
    const res = await $fetch('/api/jobs/generate-greeting', {
      method: 'POST',
      body: { jobId: job.value.jobId }
    })
    
    if (res && res.success && res.data) {
      ElMessage.success('打招呼语生成成功！')
      job.value.aiResult = res.data
    } else {
      ElMessage.error(res?.error || '生成失败，请检查配置')
    }
  } catch (error) {
    console.error('Greeting generation failed:', error)
    ElMessage.error('服务调用异常')
  } finally {
    generatingGreeting.value = false
  }
}

const copyIntro = async () => {
  if (!job.value?.aiResult?.intro) return
  try {
    await navigator.clipboard.writeText(job.value.aiResult.intro)
    ElMessage.success('已复制到剪贴板')
  } catch (err) {
    console.error('Copy failed:', err)
    ElMessage.error('复制失败')
  }
}

const handleToggleBlacklist = async (j) => {
  if (!j) return
  const comp = j.normalizedData?.companyFullName || j.normalizedData?.brandName || j.companyName
  if (!comp) {
    ElMessage.warning('未获取到该职位的公司名称')
    return
  }

  if (j.isBlacklisted) {
    try {
      const res = await $fetch(`/api/blacklist?companyName=${encodeURIComponent(comp)}`, { method: 'DELETE' })
      if (res && res.success) {
        j.isBlacklisted = false
        ElMessage.success(`已将【${comp}】移出黑名单`)
        emit('status-changed')
      } else {
        ElMessage.error(res?.error || '移出失败')
      }
    } catch (err) {
      ElMessage.error('移出黑名单失败: ' + err.message)
    }
  } else {
    try {
      const res = await $fetch('/api/blacklist', {
        method: 'POST',
        body: { companyName: comp, reason: '用户手动拉黑', source: 'manual' }
      })
      if (res && res.success) {
        j.isBlacklisted = true
        ElMessage.success(`已将【${comp}】加入黑名单`)
        emit('status-changed')
      } else {
        ElMessage.error(res?.error || '拉黑失败')
      }
    } catch (err) {
      ElMessage.error('加入黑名单失败: ' + err.message)
    }
  }
}

// AI 技能箱状态
const availableSkills = ref([])
const activeSkillName = ref('')
const activeSkillResult = ref('')
const runningSkill = ref('')

const fetchSkills = async () => {
  if (availableSkills.value.length > 0) return
  try {
    const res = await $fetch('/api/skills/list')
    if (res && res.success) {
      availableSkills.value = res.data.filter(s => s.isActive)
    }
  } catch (err) {
    console.error('Failed to fetch AI skills:', err)
  }
}

const executeSkill = async (skill) => {
  if (!job.value || !job.value.id) return
  
  runningSkill.value = skill.id
  activeSkillName.value = skill.name
  activeSkillResult.value = ''
  
  try {
    const res = await $fetch('/api/skills/execute', {
      method: 'POST',
      body: { jobId: job.value.id, skillId: skill.id }
    })
    
    if (res && res.success) {
      ElMessage.success(`${skill.name} 执行成功！`)
      activeSkillResult.value = res.data
    } else {
      ElMessage.error(res?.message || '执行失败，请检查模型配置或简历')
    }
  } catch (error) {
    console.error('Skill execution failed:', error)
    ElMessage.error('服务调用异常')
  } finally {
    runningSkill.value = ''
  }
}

const copySkillResult = async () => {
  if (!activeSkillResult.value) return
  try {
    await navigator.clipboard.writeText(activeSkillResult.value)
    ElMessage.success('已复制到剪贴板')
  } catch (err) {
    console.error('Copy failed:', err)
    ElMessage.error('复制失败')
  }
}

const open = (jobData) => {
  job.value = jobData
  visible.value = true
  activeSkillResult.value = ''
  fetchSkills()
}

const markAsExpired = async (jobData) => {
  if (!jobData || !jobData.jobId) return
  marking.value = true
  try {
    const res = await $fetch(`/api/jobs/${jobData.id}/status`, {
      method: 'PUT',
      body: { status: JobStatus.EXPIRED }
    })
    if (res.success) {
      ElMessage.success('已标记为失效职位')
      visible.value = false
      emit('status-changed', jobData, JobStatus.EXPIRED)
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
  let str = String(desc)
    .replace(/\\r\\n|\\r|\\n/g, '\n')
    .replace(/\r\n|\r/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?p[^>]*>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/?(ul|ol|div|h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")

  const rawLines = str.split('\n')
  const cleanedLines = []

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i].replace(/[ \t]+/g, ' ').trim()
    if (!line) continue

    if (line === '•' || line === '-' || line === '·') {
      let nextIndex = i + 1
      while (nextIndex < rawLines.length && !rawLines[nextIndex].trim()) {
        nextIndex++
      }
      if (nextIndex < rawLines.length) {
        const nextContent = rawLines[nextIndex].replace(/[ \t]+/g, ' ').trim()
        if (nextContent) {
          if (/^(\d+[\.、\)]|[一二三四五六七八九十]+[、\.])/.test(nextContent)) {
            cleanedLines.push(nextContent)
          } else {
            cleanedLines.push(`• ${nextContent}`)
          }
          i = nextIndex
          continue
        }
      }
      continue
    }

    if (/^•\s*(\d+[\.、\)]|[一二三四五六七八九十]+[、\.])/.test(line)) {
      line = line.replace(/^•\s*/, '')
    } else if (line.startsWith('•') && !line.startsWith('• ')) {
      line = '• ' + line.substring(1).trim()
    }

    cleanedLines.push(line)
  }

  const formattedLines = []
  const sectionKeywords = /^(岗位职责|任职要求|任职资格|职位要求|职位亮点|岗位要求|工作内容|加分项|福利待遇|我们提供|基本条件|软素质|其他要求|工作职责)[:：]?$/

  for (let i = 0; i < cleanedLines.length; i++) {
    const line = cleanedLines[i]
    if (i > 0 && sectionKeywords.test(line)) {
      if (formattedLines.length > 0 && formattedLines[formattedLines.length - 1] !== '') {
        formattedLines.push('')
      }
    }
    formattedLines.push(line)
  }

  return formattedLines.join('\n') || '暂无描述'
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
