<template>
  <el-dialog
    v-model="visible"
    :title="'🏢 ' + (company?.companyName || '企业') + ' · 招聘画像与趋势'"
    width="84%"
    top="4vh"
    destroy-on-close
    class="company-analytics-modal"
  >
    <div v-if="analysis" class="analytics-container">
      <!-- 头部概览卡片 -->
      <div class="company-header-hero">
        <div class="hero-left">
          <div class="company-title-row">
            <h2 class="company-main-title">{{ analysis.companyName }}</h2>
            <span v-if="basicInfo.companyFullName && basicInfo.companyFullName !== analysis.companyName" class="company-full-name-sub">
              {{ basicInfo.companyFullName }}
            </span>
          </div>
          <div class="company-meta-tags">
            <el-tag :type="analysis.isAgency ? 'danger' : 'success'" size="small" effect="dark">
              {{ analysis.isAgency ? '代招/猎头' : '企业直招' }}
            </el-tag>
            <el-tag v-for="p in analysis.platformSources" :key="p" size="small" type="info">{{ p }}</el-tag>
            <el-tag v-if="basicInfo.industry" size="small" type="primary" effect="plain">{{ basicInfo.industry }}</el-tag>
            <el-tag v-if="basicInfo.scale" size="small" type="success" effect="plain">{{ basicInfo.scale }}</el-tag>
            <el-tag v-if="basicInfo.stage" size="small" type="warning" effect="plain">{{ basicInfo.stage }}</el-tag>
            <el-tag v-if="basicInfo.companyType" size="small" effect="plain">{{ basicInfo.companyType }}</el-tag>
          </div>
        </div>

        <div class="heat-score-badge-card" :style="{ borderColor: heatLevel.color }">
          <div class="heat-score-val" :style="{ color: heatLevel.color }">
            {{ analysis.summary.heatScore }}<span class="heat-unit">分</span>
          </div>
          <div class="heat-score-label">招聘活跃度 · {{ heatLevel.text }}</div>
          <div class="heat-score-desc">{{ heatLevel.tip }}</div>
        </div>
      </div>

      <!-- 企业基础档案与工商信息 -->
      <div v-if="basicInfo.hasAnyBasicInfo" class="basic-profile-card">
        <div class="profile-header">
          <div class="profile-title-row">
            <h3 class="profile-section-title">🏢 企业档案与基本信息</h3>
            <span class="profile-sub-title">工商注册资质与企业背景概览</span>
          </div>
        </div>

        <!-- 关键属性网格 -->
        <div class="profile-info-grid">
          <!-- 统一社会信用代码 -->
          <div class="profile-info-item credit-code-item" v-if="basicInfo.creditCode">
            <span class="item-label">统一社会信用代码</span>
            <div class="item-value-box">
              <span class="code-font">{{ basicInfo.creditCode }}</span>
              <el-button 
                size="small" 
                text 
                type="primary" 
                class="copy-code-btn"
                @click="copyCreditCode(basicInfo.creditCode)"
              >
                📋 复制
              </el-button>
            </div>
          </div>

          <!-- 企业性质 -->
          <div class="profile-info-item" v-if="basicInfo.companyType">
            <span class="item-label">企业性质</span>
            <span class="item-value">{{ basicInfo.companyType }}</span>
          </div>

          <!-- 所属行业 -->
          <div class="profile-info-item" v-if="basicInfo.industry">
            <span class="item-label">所属行业</span>
            <span class="item-value">{{ basicInfo.industry }}</span>
          </div>

          <!-- 企业规模 -->
          <div class="profile-info-item" v-if="basicInfo.scale">
            <span class="item-label">人员规模</span>
            <span class="item-value">{{ basicInfo.scale }}</span>
          </div>

          <!-- 融资阶段 -->
          <div class="profile-info-item" v-if="basicInfo.stage">
            <span class="item-label">融资阶段</span>
            <span class="item-value">{{ basicInfo.stage }}</span>
          </div>

          <!-- 企业官方全称 -->
          <div class="profile-info-item" v-if="basicInfo.companyFullName && basicInfo.companyFullName !== analysis.companyName">
            <span class="item-label">企业注册全称</span>
            <span class="item-value font-medium">{{ basicInfo.companyFullName }}</span>
          </div>

          <!-- 法定代表人 -->
          <div class="profile-info-item" v-if="basicInfo.legalPerson">
            <span class="item-label">法定代表人</span>
            <span class="item-value">{{ basicInfo.legalPerson }}</span>
          </div>

          <!-- 注册资本 -->
          <div class="profile-info-item" v-if="basicInfo.registeredCapital">
            <span class="item-label">注册资本</span>
            <span class="item-value">{{ basicInfo.registeredCapital }}</span>
          </div>

          <!-- 成立时间 -->
          <div class="profile-info-item" v-if="basicInfo.establishmentDate">
            <span class="item-label">成立时间</span>
            <span class="item-value">{{ basicInfo.establishmentDate }}</span>
          </div>

          <!-- 办公/注册地址 -->
          <div class="profile-info-item full-width" v-if="basicInfo.address">
            <span class="item-label">办公/注册地址</span>
            <span class="item-value">{{ basicInfo.address }}</span>
          </div>
        </div>

        <!-- 福利待遇 -->
        <div v-if="basicInfo.welfare && basicInfo.welfare.length" class="profile-welfare-block">
          <div class="welfare-label">
            <span>🎁 企业福利待遇 ({{ basicInfo.welfare.length }} 项)</span>
          </div>
          <div class="welfare-tags-row">
            <el-tag
              v-for="(w, idx) in basicInfo.welfare"
              :key="idx"
              size="small"
              type="success"
              effect="light"
              class="welfare-pill"
            >
              {{ w }}
            </el-tag>
          </div>
        </div>

        <!-- 公司介绍 -->
        <div v-if="basicInfo.description" class="profile-desc-block">
          <div class="desc-header">
            <span class="desc-label">📖 公司介绍</span>
            <el-button 
              v-if="basicInfo.description.length > 200" 
              size="small" 
              link 
              type="primary" 
              @click="toggleDesc"
            >
              {{ descExpanded ? '收起 ▴' : '展开全部 ▾' }}
            </el-button>
          </div>
          <div 
            class="desc-content" 
            :class="{ 'is-collapsed': !descExpanded && basicInfo.description.length > 200 }"
          >
            {{ basicInfo.description }}
          </div>
        </div>
      </div>

      <!-- 招聘数据与趋势画像分界标题 -->
      <div class="section-divider-bar">
        <span class="divider-title">📊 招聘画像与趋势分析</span>
        <span class="divider-sub">基于全网多渠道爬取岗位的综合统计分析</span>
      </div>

      <!-- KPI 数据矩阵 -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <span class="kpi-title">存量在招职位</span>
          <span class="kpi-num primary">{{ analysis.summary.totalJobs }}</span>
          <span class="kpi-sub">有效职位数</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-title">近 30 天新发</span>
          <span class="kpi-num warning">{{ analysis.summary.recent30d }}</span>
          <span class="kpi-sub">占总职位 {{ analysis.summary.heatScore }}%</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-title">7 天内黄金新发</span>
          <span class="kpi-num success">{{ analysis.summary.recent7d }}</span>
          <span class="kpi-sub">建议抓紧投递</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-title">平均薪资区间</span>
          <span class="kpi-num accent" v-if="analysis.summary.avgSalaryMin !== null">
            {{ analysis.summary.avgSalaryMin }}~{{ analysis.summary.avgSalaryMax }}K
          </span>
          <span class="kpi-num text-muted" v-else>面议为主</span>
          <span class="kpi-sub">均值 {{ analysis.summary.avgSalaryMid ? analysis.summary.avgSalaryMid + 'K' : '-' }}</span>
        </div>
      </div>

      <!-- 趋势折线图 (Full Width) -->
      <div class="chart-section">
        <div class="chart-card">
          <div class="chart-header">
            <h4 class="chart-title">📈 月度招聘趋势 (新发岗位走势)</h4>
            <span class="chart-sub">基于职位初次发现时间 (firstSeen) 统计，展现企业扩招/缩招节奏</span>
          </div>
          <ClientOnly>
            <v-chart class="chart trend-line-chart" :option="monthlyTrendOption" autoresize />
          </ClientOnly>
        </div>
      </div>

      <!-- 薪资与经验分布 (Two Columns) -->
      <div class="two-charts-row">
        <!-- 薪资分布 -->
        <div class="chart-card">
          <h4 class="chart-title">💰 岗位薪资分布</h4>
          <ClientOnly>
            <v-chart class="chart" :option="salaryDistOption" autoresize />
          </ClientOnly>
        </div>

        <!-- 经验要求分布 -->
        <div class="chart-card">
          <h4 class="chart-title">🎓 经验要求比例</h4>
          <ClientOnly>
            <v-chart class="chart" :option="expDistOption" autoresize />
          </ClientOnly>
        </div>
      </div>

      <!-- 高频技能与热门岗位 -->
      <div class="two-charts-row">
        <!-- 核心技能标签 -->
        <div class="info-card">
          <h4 class="chart-title">🏷️ 高频技术栈与技能需求 (Top 20)</h4>
          <div class="skills-cloud-tags">
            <el-tag
              v-for="(t, idx) in analysis.topTags"
              :key="idx"
              size="default"
              :type="idx < 5 ? 'danger' : (idx < 10 ? 'warning' : 'primary')"
              effect="light"
              class="tech-tag"
            >
              {{ t.tag }} <span class="tag-badge">{{ t.count }}</span>
            </el-tag>
            <span v-if="!analysis.topTags.length" class="text-muted">暂未提取到足够技术标签</span>
          </div>
        </div>

        <!-- 热门招聘岗位名称 -->
        <div class="info-card">
          <h4 class="chart-title">📋 主要在招岗位名称 (Top 10)</h4>
          <div class="roles-list">
            <div v-for="(r, idx) in analysis.topTitles" :key="idx" class="role-item">
              <span class="role-rank" :class="{ 'top-3': idx < 3 }">{{ idx + 1 }}</span>
              <span class="role-name" :title="r.title">{{ r.title }}</span>
              <span class="role-count">{{ r.count }} 个</span>
            </div>
            <span v-if="!analysis.topTitles.length" class="text-muted">暂无职位</span>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="visible = false">关闭</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { analyzeCompany } from '~/utils/companyAnalytics'

// Echarts setup
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, PieChart, LineChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
} from 'echarts/components'
import VChart from 'vue-echarts'

use([
  CanvasRenderer,
  BarChart,
  PieChart,
  LineChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
])

const visible = ref(false)
const company = ref(null)
const descExpanded = ref(false)

const open = (companyData) => {
  company.value = companyData
  descExpanded.value = false
  visible.value = true
}

defineExpose({ open })

const toggleDesc = () => {
  descExpanded.value = !descExpanded.value
}

const copyCreditCode = (code) => {
  if (!code) return
  if (navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(code)
      .then(() => ElMessage.success('统一社会信用代码已复制'))
      .catch(() => fallbackCopy(code))
  } else {
    fallbackCopy(code)
  }
}

const fallbackCopy = (text) => {
  try {
    const input = document.createElement('input')
    input.value = text
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
    ElMessage.success('统一社会信用代码已复制')
  } catch (e) {
    ElMessage.error('复制失败，请手动选择复制')
  }
}

const analysis = computed(() => {
  if (!company.value) return null
  return analyzeCompany(company.value)
})

const basicInfo = computed(() => {
  const c = company.value || {}
  const raw = c.rawData || {}
  const raw2 = c.rawData2 || {}
  const raw3 = c.rawData3 || {}

  const companyFullName = c.companyFullName || raw2.companyFullName || raw2.compFullName || raw3.companyFullName || raw3['公司全称'] || raw3.compFullName || raw.companyFullName || raw.compFullName || ''
  const industry = c.industry || raw2.industry || raw2.companyIndustry || raw2.compIndustry || raw3.industry || raw3['公司行业'] || raw3.companyIndustry || raw3.compIndustry || raw.industry || raw.companyIndustry || raw.compIndustry || ''
  const scale = c.scale || raw2.scale || raw2.companyScale || raw2.compScale || raw3.scale || raw3['公司规模'] || raw3.companyScale || raw3.compScale || raw.scale || raw.companyScale || raw.compScale || ''
  const stage = c.stage || raw2.stage || raw2.companyStage || raw2.compStage || raw3.stage || raw3['融资阶段'] || raw3.companyStage || raw3.compStage || raw.stage || raw.companyStage || raw.compStage || ''
  const companyType = c.companyType || raw2.companyType || raw2.compKindName || raw3.companyType || raw3['企业类型'] || raw3.compKindName || raw.companyType || raw.compKindName || ''
  const creditCode = c.creditCode || raw2.creditCode || raw2.unifiedSocialCreditCode || raw3.creditCode || raw3.unifiedSocialCreditCode || raw3['统一社会信用代码'] || raw.creditCode || raw.unifiedSocialCreditCode || ''

  const address = raw2.companyAddress || raw2.address || raw2.businessAddress || raw3['详细完整地址'] || raw3.companyAddress || raw3.address || raw.companyAddress || raw.address || raw.businessAddress || ''
  const legalPerson = raw2.legalPerson || raw2.representative || raw2.businessLicense?.legalPerson || raw3['法定代表人'] || raw3.legalPerson || raw3.representative || raw.legalPerson || raw.representative || raw.businessLicense?.legalPerson || ''
  const registeredCapital = raw2.registeredCapital || raw2.businessLicense?.registeredCapital || raw3['注册资金'] || raw3['注册资本'] || raw3.registeredCapital || raw.registeredCapital || raw.businessLicense?.registeredCapital || ''
  const establishmentDate = raw2.establishmentDate || raw2.businessLicense?.startDate || raw3['成立日期'] || raw3.establishmentDate || raw.establishmentDate || raw.businessLicense?.startDate || ''

  const description = raw2.companyDesc || raw2.intro || raw2.description || raw2.companyIntro || raw3.companyDesc || raw3.intro || raw.companyDesc || raw.intro || raw.description || raw.companyIntro || ''

  let welfare = []
  if (Array.isArray(c.welfareList) && c.welfareList.length > 0) {
    welfare = c.welfareList
  } else if (Array.isArray(raw2.welfareList) && raw2.welfareList.length > 0) {
    welfare = raw2.welfareList
  } else if (Array.isArray(raw3.welfareList) && raw3.welfareList.length > 0) {
    welfare = raw3.welfareList
  } else if (typeof raw3['公司福利'] === 'string' && raw3['公司福利'].trim()) {
    welfare = raw3['公司福利'].split(',').map((s: string) => s.trim()).filter(Boolean)
  } else if (Array.isArray(raw.welfare) && raw.welfare.length > 0) {
    welfare = raw.welfare
  } else if (Array.isArray(raw.welfareList) && raw.welfareList.length > 0) {
    welfare = raw.welfareList
  }

  const hasAnyBasicInfo = !!(
    creditCode ||
    companyFullName ||
    industry ||
    scale ||
    stage ||
    companyType ||
    address ||
    legalPerson ||
    registeredCapital ||
    establishmentDate ||
    description ||
    welfare.length
  )

  return {
    hasAnyBasicInfo,
    companyFullName,
    industry,
    scale,
    stage,
    companyType,
    creditCode,
    address,
    legalPerson,
    registeredCapital,
    establishmentDate,
    description,
    welfare
  }
})

const heatLevel = computed(() => {
  const score = analysis.value?.summary.heatScore || 0
  if (score >= 60) {
    return { text: '旺盛扩招', color: '#ea580c', tip: '近期有大量新发职位，业务处于扩张期' }
  } else if (score >= 30) {
    return { text: '平稳招聘', color: '#16a34a', tip: '常规岗位轮换与补招，招聘节奏稳定' }
  } else {
    return { text: '招聘收紧', color: '#64748b', tip: '近期新发岗位少，存量职位占主导' }
  }
})

// 1. 月度招聘趋势折线图
const monthlyTrendOption = computed(() => {
  const data = analysis.value?.monthlyTrend || []
  const xData = data.map(d => d.month)
  const yData = data.map(d => d.count)

  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    grid: { left: '3%', right: '4%', bottom: '5%', top: '15%', containLabel: true },
    xAxis: {
      type: 'category',
      data: xData,
      boundaryGap: false,
      axisLabel: { color: '#64748b' }
    },
    yAxis: {
      type: 'value',
      name: '新发职位数',
      splitLine: { lineStyle: { stroke: '#f1f5f9', type: 'dashed' } }
    },
    series: [
      {
        name: '新发职位',
        type: 'line',
        smooth: true,
        data: yData,
        symbolSize: 8,
        itemStyle: { color: '#0ea5e9' },
        lineStyle: { width: 3, color: '#0ea5e9' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(14, 165, 233, 0.4)' },
              { offset: 1, color: 'rgba(14, 165, 233, 0.02)' }
            ]
          }
        }
      }
    ]
  }
})

// 2. 薪资分布直方图
const salaryDistOption = computed(() => {
  const data = analysis.value?.salaryDist || []
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '4%', bottom: '5%', top: '10%', containLabel: true },
    xAxis: {
      type: 'category',
      data: data.map(d => d.range),
      axisLabel: { interval: 0 }
    },
    yAxis: { type: 'value', splitLine: { lineStyle: { stroke: '#f1f5f9', type: 'dashed' } } },
    series: [
      {
        name: '岗位数量',
        type: 'bar',
        barWidth: '50%',
        data: data.map(d => d.count),
        itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] }
      }
    ]
  }
})

// 3. 经验要求分布饼图
const expDistOption = computed(() => {
  const data = analysis.value?.expDist || []
  return {
    tooltip: { trigger: 'item' },
    legend: { bottom: '0', left: 'center' },
    series: [
      {
        name: '经验年限',
        type: 'pie',
        radius: ['35%', '65%'],
        center: ['50%', '42%'],
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        data: data
      }
    ],
    color: ['#0284c7', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#94a3b8']
  }
})
</script>

<style scoped>
:deep(.el-dialog__body) {
  max-height: 80vh;
  overflow-y: auto;
  padding: 16px 20px 24px 20px;
}

.analytics-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.company-header-hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f8fafc;
  padding: 16px 20px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
}

.hero-left {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.company-title-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.company-main-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
}

.company-full-name-sub {
  font-size: 13px;
  color: #64748b;
  font-weight: 500;
}

.company-meta-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.heat-score-badge-card {
  border: 2px solid;
  border-radius: 10px;
  padding: 10px 18px;
  text-align: right;
  background: white;
  min-width: 170px;
}

.heat-score-val {
  font-size: 28px;
  font-weight: 800;
  line-height: 1;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.heat-unit {
  font-size: 14px;
  font-weight: 500;
  margin-left: 2px;
}

.heat-score-label {
  font-size: 13px;
  font-weight: 700;
  color: #334155;
  margin-top: 4px;
}

.heat-score-desc {
  font-size: 11px;
  color: #64748b;
  margin-top: 2px;
}

/* 企业基础档案卡片 */
.basic-profile-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 16px 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.profile-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 10px;
}

.profile-title-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.profile-section-title {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}

.profile-sub-title {
  font-size: 12px;
  color: #94a3b8;
}

.profile-info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 10px 16px;
}

.profile-info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: #f8fafc;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #f1f5f9;
}

.profile-info-item.full-width {
  grid-column: 1 / -1;
}

.item-label {
  font-size: 11px;
  color: #64748b;
  font-weight: 500;
}

.item-value {
  font-size: 13px;
  color: #1e293b;
  font-weight: 600;
  word-break: break-all;
}

.item-value-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.code-font {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-weight: 700;
  font-size: 13px;
  color: #0f172a;
  letter-spacing: 0.5px;
}

.copy-code-btn {
  padding: 0 4px;
  height: 20px;
  font-size: 11px;
}

.profile-welfare-block {
  background: #f0fdf4;
  border: 1px solid #dcfce7;
  border-radius: 8px;
  padding: 12px 14px;
  margin-top: 12px;
}

.welfare-label {
  font-size: 12px;
  font-weight: 700;
  color: #166534;
  margin-bottom: 8px;
}

.welfare-tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.welfare-pill {
  border-radius: 4px;
}

.profile-desc-block {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px 14px;
  margin-top: 12px;
}

.desc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.desc-label {
  font-size: 12px;
  font-weight: 700;
  color: #334155;
}

.desc-content {
  font-size: 13px;
  color: #475569;
  line-height: 1.6;
  white-space: pre-wrap;
}

.desc-content.is-collapsed {
  max-height: 80px;
  overflow: hidden;
  position: relative;
  mask-image: linear-gradient(180deg, #000 60%, transparent);
}

/* 分界标题 */
.section-divider-bar {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 4px;
  padding: 4px 2px;
}

.divider-title {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
}

.divider-sub {
  font-size: 12px;
  color: #94a3b8;
}

/* KPI Matrix */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

.kpi-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.kpi-title {
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
}

.kpi-num {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
}

.kpi-num.primary { color: #0284c7; }
.kpi-num.warning { color: #ea580c; }
.kpi-num.success { color: #16a34a; }
.kpi-num.accent { color: #d97706; }

.kpi-sub {
  font-size: 11px;
  color: #94a3b8;
}

.chart-card, .info-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px;
}

.chart-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.chart-title {
  margin: 0 0 10px 0;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.chart-sub {
  font-size: 12px;
  color: #94a3b8;
}

.chart {
  height: 260px;
  width: 100%;
}

.trend-line-chart {
  height: 250px;
}

.two-charts-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

/* Skills & Roles */
.skills-cloud-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tech-tag {
  font-size: 12px;
  padding: 4px 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.tag-badge {
  background: rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  padding: 0 5px;
  font-size: 10px;
}

.roles-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.role-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 4px;
  background: #f8fafc;
  font-size: 13px;
}

.role-rank {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #e2e8f0;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.role-rank.top-3 {
  background: #0ea5e9;
  color: white;
}

.role-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #334155;
}

.role-count {
  font-weight: 600;
  color: #0284c7;
  font-size: 12px;
}

.text-muted {
  color: #94a3b8;
  font-size: 12px;
}

@media (max-width: 900px) {
  .company-header-hero {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  .kpi-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .two-charts-row {
    grid-template-columns: 1fr;
  }
}
</style>
