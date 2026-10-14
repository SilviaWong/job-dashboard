<template>
  <div class="funnel-view">
    <!-- Funnel KPI Row -->
    <div class="kpi-row">
      <div class="kpi-card">
        <div class="kpi-label">累计发起投递</div>
        <div class="kpi-value primary">{{ funnelData?.kpi?.totalApplied || 0 }}</div>
        <div class="kpi-tip">储备意向 {{ funnelData?.funnelSteps?.[0]?.count || 0 }} · 储备转化率 {{ appliedRate }}%</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">面试邀请转化率</div>
        <div class="kpi-value success">{{ funnelData?.kpi?.interviewRate || 0 }}%</div>
        <div class="kpi-tip">已进入初面 {{ funnelData?.kpi?.totalInterviews || 0 }} 场 (行业均值约 15-25%)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">平均约面响应周期</div>
        <div class="kpi-value warning">{{ funnelData?.kpi?.avgDaysToInterview || 0 }} <span class="unit">天</span></div>
        <div class="kpi-tip">从投递到首次约面的平均耗时</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">斩获录取意向 (Offer)</div>
        <div class="kpi-value accent">{{ funnelData?.kpi?.totalOffers || 0 }}</div>
        <div class="kpi-tip">总 Offer 转化率 {{ funnelData?.kpi?.overallOfferRate || 0 }}%</div>
      </div>
    </div>

    <!-- Charts Row 1: Funnel & Durations -->
    <div class="charts-row">
      <div class="chart-card">
        <div class="card-title-group">
          <h3 class="chart-title">🔻 求职全链路转化漏斗</h3>
          <span class="card-subtitle">追踪从意向储备、发起投递、初试、复试到最终 Offer 的逐步留存</span>
        </div>
        <ClientOnly>
          <v-chart class="chart" :option="funnelChartOption" autoresize />
        </ClientOnly>
      </div>

      <div class="chart-card">
        <div class="card-title-group">
          <h3 class="chart-title">⏱️ 各阶段流转耗时 (天数)</h3>
          <span class="card-subtitle">量化招聘流速与各关卡推进周期</span>
        </div>
        <ClientOnly>
          <v-chart class="chart" :option="durationsChartOption" autoresize />
        </ClientOnly>
      </div>
    </div>

    <!-- Charts Row 2: Weekly Trend & Rejection Breakdown -->
    <div class="charts-row">
      <div class="chart-card">
        <div class="card-title-group">
          <h3 class="chart-title">📊 近 12 周投递与约面节奏</h3>
          <span class="card-subtitle">对比每周实际投递数与约面推进频次</span>
        </div>
        <ClientOnly>
          <v-chart class="chart" :option="weeklyTrendOption" autoresize />
        </ClientOnly>
      </div>

      <div class="chart-card">
        <div class="card-title-group">
          <h3 class="chart-title">📉 淘汰与流失阶段归因</h3>
          <span class="card-subtitle">精准暴露求职短板，识别流失主要发生阶段</span>
        </div>
        <ClientOnly>
          <v-chart class="chart" :option="rejectionChartOption" autoresize />
        </ClientOnly>
      </div>
    </div>

    <!-- Stagnant Alert Panel -->
    <div class="chart-card stagnant-panel">
      <div class="stagnant-header">
        <div class="stagnant-badge" :class="hasStagnant ? 'danger' : 'safe'">
          {{ hasStagnant ? `${funnelData.stagnantJobs.length} 个岗位待跟进` : '流转正常' }}
        </div>
        <div class="stagnant-title-group">
          <h3 class="chart-title" style="margin: 0;">⚠️ 滞留风险与超时监控 (已投递超7天 / 面试超5天)</h3>
          <span class="card-subtitle">及时复盘、主动催促HR或补充新岗位</span>
        </div>
      </div>

      <div v-if="!hasStagnant" class="stagnant-empty">
        <span class="empty-icon">🎉</span>
        <p class="empty-text">太棒了！当前跟进中的投递与面试均在健康周期内，暂无严重滞留岗位。</p>
      </div>

      <div v-else class="stagnant-grid">
        <div
          v-for="job in funnelData.stagnantJobs"
          :key="job.id"
          class="stagnant-card"
          :class="job.riskLevel"
          @click="$emit('select-job', job.id)"
        >
          <div class="stagnant-card-top">
            <span class="stagnant-job-title" :title="job.title">{{ job.title }}</span>
            <el-tag size="small" :type="job.riskLevel === 'danger' ? 'danger' : 'warning'">
              停滞 {{ job.daysWaiting }} 天
            </el-tag>
          </div>
          <div class="stagnant-card-company">
            <span>{{ job.companyName }}</span>
            <span class="stagnant-salary">{{ job.salary }}</span>
          </div>
          <div class="stagnant-card-reason">{{ job.reason }}</div>
          <div class="stagnant-card-footer">
            <span class="stagnant-platform-tag">{{ job.platform }}</span>
            <span class="stagnant-action-link">查看详情与复盘 ➔</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { FunnelChart, BarChart, PieChart, LineChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
} from 'echarts/components'
import VChart from 'vue-echarts'

use([
  CanvasRenderer,
  FunnelChart,
  BarChart,
  PieChart,
  LineChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
])

const props = defineProps({
  funnelData: {
    type: Object,
    default: () => ({})
  }
})

defineEmits(['select-job'])

const hasStagnant = computed(() => {
  return props.funnelData?.stagnantJobs?.length > 0
})

const appliedRate = computed(() => {
  const steps = props.funnelData?.funnelSteps || []
  const toApply = steps.find(s => s.key === 'to-apply')?.count || 0
  const applied = steps.find(s => s.key === 'applied')?.count || 0
  if (toApply === 0) return applied > 0 ? 100 : 0
  return Math.min(100, Math.round((applied / toApply) * 1000) / 10)
})

// 1. 漏斗图 Option
const funnelChartOption = computed(() => {
  const steps = props.funnelData?.funnelSteps || []
  const data = steps.map(s => ({
    name: s.name,
    value: s.count,
    current: s.current
  }))

  return {
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        const item = params.data
        return `<b>${item.name}</b><br/>累计推进: <b>${item.value}</b> 个<br/>当前在榜: <b>${item.current || 0}</b> 个`
      }
    },
    series: [
      {
        name: '求职全链路漏斗',
        type: 'funnel',
        left: '10%',
        top: 20,
        bottom: 20,
        width: '80%',
        min: 0,
        minSize: '12%',
        maxSize: '100%',
        sort: 'descending',
        gap: 4,
        label: {
          show: true,
          position: 'inside',
          formatter: '{b}: {c}',
          color: '#ffffff',
          fontWeight: 600,
          fontSize: 13
        },
        itemStyle: {
          borderColor: '#fff',
          borderWidth: 2,
          borderRadius: 4
        },
        emphasis: {
          label: {
            fontSize: 15
          }
        },
        data,
        color: ['#0284c7', '#2563eb', '#7c3aed', '#db2777', '#16a34a']
      }
    ]
  }
})

// 2. 各阶段流转耗时 Option (横向柱状图)
const durationsChartOption = computed(() => {
  const list = props.funnelData?.durations || []
  const yLabels = list.map(d => d.stage).reverse()
  const xValues = list.map(d => d.avgDays).reverse()
  const counts = list.map(d => d.count).reverse()

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const idx = params[0].dataIndex
        const stage = yLabels[idx]
        const val = xValues[idx]
        const count = counts[idx]
        return `<b>${stage}</b><br/>平均耗时: <b>${val}</b> 天<br/>统计样本: <b>${count}</b> 次`
      }
    },
    grid: { left: '3%', right: '8%', bottom: '6%', top: '8%', containLabel: true },
    xAxis: {
      type: 'value',
      name: '天数',
      splitLine: { lineStyle: { stroke: '#f1f5f9', type: 'dashed' } }
    },
    yAxis: {
      type: 'category',
      data: yLabels,
      axisLabel: { color: '#334155', fontWeight: 500 }
    },
    series: [
      {
        name: '平均流转周期',
        type: 'bar',
        barWidth: 22,
        data: xValues,
        itemStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [
              { offset: 0, color: '#38bdf8' },
              { offset: 1, color: '#0284c7' }
            ]
          },
          borderRadius: [0, 6, 6, 0]
        },
        label: {
          show: true,
          position: 'right',
          formatter: '{c} 天',
          color: '#475569',
          fontWeight: 600
        }
      }
    ]
  }
})

// 3. 周度推进时序 Option
const weeklyTrendOption = computed(() => {
  const timeline = props.funnelData?.weeklyTimeline || []
  const xData = timeline.map(t => t.label)
  const appliedData = timeline.map(t => t.applied)
  const interviewData = timeline.map(t => t.interview)

  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    legend: { top: 0, data: ['发起投递', '推进面试'] },
    grid: { left: '3%', right: '4%', bottom: '8%', top: '15%', containLabel: true },
    xAxis: {
      type: 'category',
      data: xData,
      axisLabel: { color: '#64748b' }
    },
    yAxis: {
      type: 'value',
      name: '职位数',
      splitLine: { lineStyle: { stroke: '#f1f5f9', type: 'dashed' } }
    },
    series: [
      {
        name: '发起投递',
        type: 'bar',
        data: appliedData,
        barWidth: 14,
        itemStyle: { color: '#0ea5e9', borderRadius: [4, 4, 0, 0] }
      },
      {
        name: '推进面试',
        type: 'line',
        data: interviewData,
        smooth: true,
        symbolSize: 6,
        itemStyle: { color: '#8b5cf6' },
        lineStyle: { width: 3, color: '#8b5cf6' }
      }
    ]
  }
})

// 4. 淘汰归因环形图 Option
const rejectionChartOption = computed(() => {
  const list = props.funnelData?.rejectionBreakdown || []
  const total = list.reduce((sum, item) => sum + item.value, 0)

  return {
    tooltip: { trigger: 'item', formatter: '{b}: <b>{c}</b> 个 ({d}%)' },
    legend: { bottom: 0, left: 'center' },
    series: [
      {
        name: '淘汰阶段归因',
        type: 'pie',
        radius: ['45%', '72%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 8,
          borderColor: '#fff',
          borderWidth: 2
        },
        label: {
          show: total > 0,
          formatter: '{b}\n{d}%'
        },
        data: list.length > 0 && total > 0 ? list : [{ name: '暂无淘汰记录', value: 0 }],
        color: ['#ef4444', '#f59e0b', '#3b82f6', '#94a3b8']
      }
    ]
  }
})
</script>

<style scoped>
.funnel-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* KPI Card Row */
.kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.kpi-card {
  background: white;
  padding: 18px 20px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
  border: 1px solid var(--border-color, #e2e8f0);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kpi-label {
  font-size: 13px;
  color: #64748b;
  font-weight: 500;
}

.kpi-value {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.kpi-value .unit {
  font-size: 16px;
  font-weight: 500;
  color: #64748b;
  margin-left: 2px;
}

.kpi-value.primary { color: #0284c7; }
.kpi-value.success { color: #16a34a; }
.kpi-value.warning { color: #ea580c; }
.kpi-value.accent { color: #7c3aed; }

.kpi-tip {
  font-size: 12px;
  color: #94a3b8;
}

/* Charts */
.charts-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.chart-card {
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
  border: 1px solid var(--border-color, #e2e8f0);
}

.card-title-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.chart-title {
  margin: 0;
  font-size: 15px;
  color: #1e293b;
  font-weight: 600;
}

.card-subtitle {
  font-size: 12px;
  color: #94a3b8;
}

.chart {
  height: 320px;
  width: 100%;
}

/* Stagnant Panel */
.stagnant-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stagnant-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stagnant-badge {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 20px;
  font-weight: 600;
}

.stagnant-badge.danger {
  background: #fee2e2;
  color: #b91c1c;
}

.stagnant-badge.safe {
  background: #dcfce7;
  color: #15803d;
}

.stagnant-empty {
  padding: 32px 16px;
  text-align: center;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px dashed #cbd5e1;
}

.empty-icon {
  font-size: 32px;
}

.empty-text {
  margin-top: 8px;
  font-size: 14px;
  color: #475569;
}

.stagnant-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
  gap: 14px;
}

.stagnant-card {
  padding: 14px 16px;
  border-radius: 10px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
}

.stagnant-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
}

.stagnant-card.danger {
  border-left: 4px solid #ef4444;
  background: #fffafa;
}

.stagnant-card.warning {
  border-left: 4px solid #f59e0b;
  background: #fffdfa;
}

.stagnant-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.stagnant-job-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stagnant-card-company {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #64748b;
}

.stagnant-salary {
  font-weight: 600;
  color: #0284c7;
}

.stagnant-card-reason {
  font-size: 12px;
  color: #e11d48;
  line-height: 1.4;
  background: rgba(225, 29, 72, 0.05);
  padding: 6px 8px;
  border-radius: 6px;
}

.stagnant-card.warning .stagnant-card-reason {
  color: #d97706;
  background: rgba(217, 119, 6, 0.06);
}

.stagnant-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px dashed #f1f5f9;
}

.stagnant-platform-tag {
  font-size: 11px;
  color: #94a3b8;
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
}

.stagnant-action-link {
  font-size: 12px;
  color: #0284c7;
  font-weight: 500;
}

@media (max-width: 900px) {
  .kpi-row { grid-template-columns: repeat(2, 1fr); }
  .charts-row { grid-template-columns: 1fr; }
}
</style>
