<template>
  <el-dialog
    v-model="visible"
    :title="'🏢 ' + (company?.companyName || '企业') + ' · 招聘画像与趋势'"
    width="82%"
    top="6vh"
    destroy-on-close
    class="company-analytics-modal"
  >
    <div v-if="analysis" class="analytics-container">
      <!-- 头部概览卡片 -->
      <div class="company-header-hero">
        <div class="hero-left">
          <h2 class="company-main-title">{{ analysis.companyName }}</h2>
          <div class="company-meta-tags">
            <el-tag :type="analysis.isAgency ? 'danger' : 'success'" size="small" effect="dark">
              {{ analysis.isAgency ? '代招/猎头' : '企业直招' }}
            </el-tag>
            <el-tag v-for="p in analysis.platformSources" :key="p" size="small" type="info">{{ p }}</el-tag>
            <el-tag v-if="company?.rawData?.companyIndustry" size="small" effect="plain">{{ company.rawData.companyIndustry }}</el-tag>
            <el-tag v-if="company?.rawData?.companyScale" size="small" effect="plain">{{ company.rawData.companyScale }}</el-tag>
            <el-tag v-if="company?.rawData?.companyStage" size="small" effect="plain">{{ company.rawData.companyStage }}</el-tag>
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

const open = (companyData) => {
  company.value = companyData
  visible.value = true
}

defineExpose({ open })

const analysis = computed(() => {
  if (!company.value) return null
  return analyzeCompany(company.value)
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
.analytics-container {
  display: flex;
  flex-direction: column;
  gap: 18px;
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

.company-main-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
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
