<template>
  <el-dialog
    v-model="visible"
    title="⚖️ 企业招聘横向对比 (2~4家)"
    width="88%"
    top="5vh"
    destroy-on-close
    class="company-compare-modal"
  >
    <div v-if="analyzedList.length >= 2" class="compare-container">
      <!-- 顶部提示 -->
      <div class="compare-header-tip">
        <span>已选定 <strong>{{ analyzedList.length }}</strong> 家目标企业，横向评估招聘活跃度、薪资竞争力与技术偏好，辅助投递决策。</span>
      </div>

      <!-- 横向对比表格 -->
      <div class="table-card">
        <h4 class="section-title">📊 关键指标横向对比</h4>
        <div class="table-responsive">
          <table class="compare-table">
            <thead>
              <tr>
                <th>对比维度</th>
                <th v-for="item in analyzedList" :key="item.companyName">
                  <div class="th-company">
                    <span class="th-name">{{ item.companyName }}</span>
                    <el-tag size="small" :type="item.isAgency ? 'danger' : 'success'" effect="plain">
                      {{ item.isAgency ? '代招/猎头' : '企业直招' }}
                    </el-tag>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="dim-label">来源平台</td>
                <td v-for="item in analyzedList" :key="item.companyName + '-plat'">
                  <div class="platform-tags">
                    <el-tag v-for="p in item.platformSources" :key="p" size="small" type="info">{{ p }}</el-tag>
                  </div>
                </td>
              </tr>
              <tr>
                <td class="dim-label">职位存量 / 在招</td>
                <td v-for="item in analyzedList" :key="item.companyName + '-jobs'">
                  <span class="metric-strong">{{ item.summary.totalJobs }}</span> 岗位
                  <span class="sub-metric">（在招 {{ item.summary.activeJobs }}）</span>
                </td>
              </tr>
              <tr>
                <td class="dim-label">招聘活跃度 (30天新增)</td>
                <td v-for="item in analyzedList" :key="item.companyName + '-heat'">
                  <div class="heat-wrapper">
                    <div class="heat-text">
                      <span class="metric-strong" :style="{ color: getHeatColor(item.summary.heatScore) }">
                        {{ item.summary.recent30d }} 个新发
                      </span>
                      <span class="heat-badge" :style="{ background: getHeatColor(item.summary.heatScore) }">
                        热度 {{ item.summary.heatScore }}分
                      </span>
                    </div>
                    <el-progress
                      :percentage="item.summary.heatScore"
                      :color="getHeatColor(item.summary.heatScore)"
                      :show-text="false"
                      :stroke-width="6"
                    />
                  </div>
                </td>
              </tr>
              <tr>
                <td class="dim-label">7天内黄金新发</td>
                <td v-for="item in analyzedList" :key="item.companyName + '-7d'">
                  <span v-if="item.summary.recent7d > 0" class="badge-new-7d">
                    🟢 {{ item.summary.recent7d }} 个 (建议优先投递)
                  </span>
                  <span v-else class="text-muted">近7天无新发</span>
                </td>
              </tr>
              <tr>
                <td class="dim-label">平均薪资区间 (K/月)</td>
                <td v-for="item in analyzedList" :key="item.companyName + '-salary'">
                  <div v-if="item.summary.avgSalaryMin !== null" class="salary-range-box">
                    <span class="salary-val">{{ item.summary.avgSalaryMin }}K ~ {{ item.summary.avgSalaryMax }}K</span>
                    <span class="sub-metric">（均值 {{ item.summary.avgSalaryMid }}K）</span>
                  </div>
                  <span v-else class="text-muted">暂无明确薪资</span>
                </td>
              </tr>
              <tr>
                <td class="dim-label">Top 5 热门技术栈</td>
                <td v-for="item in analyzedList" :key="item.companyName + '-tags'">
                  <div class="tech-tags-list">
                    <el-tag
                      v-for="(t, idx) in item.topTags.slice(0, 5)"
                      :key="idx"
                      size="small"
                      type="primary"
                      effect="light"
                    >
                      {{ t.tag }} <span class="tag-cnt">({{ t.count }})</span>
                    </el-tag>
                  </div>
                </td>
              </tr>
              <tr>
                <td class="dim-label">主要招聘城市</td>
                <td v-for="item in analyzedList" :key="item.companyName + '-city'">
                  <span v-for="(c, idx) in item.cityDist.slice(0, 3)" :key="idx" class="city-item">
                    {{ c.name }}({{ c.value }}){{ idx < Math.min(item.cityDist.length, 3) - 1 ? ' · ' : '' }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 可视化图表并排对比 -->
      <div class="charts-grid">
        <!-- 薪资竞争力对比 -->
        <div class="chart-box">
          <h4 class="section-title">💰 薪资区间横向对比 (K/月)</h4>
          <ClientOnly>
            <v-chart class="compare-chart" :option="salaryCompareChartOption" autoresize />
          </ClientOnly>
        </div>

        <!-- 招聘热度与近30天增量对比 -->
        <div class="chart-box">
          <h4 class="section-title">🔥 招聘热度与新发职位对比</h4>
          <ClientOnly>
            <v-chart class="compare-chart" :option="heatCompareChartOption" autoresize />
          </ClientOnly>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <el-empty description="请选择至少 2 家、至多 4 家企业进行对比" />
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
import { BarChart } from 'echarts/charts'
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
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
])

const visible = ref(false)
const selectedCompanies = ref([])

const open = (companiesList) => {
  selectedCompanies.value = companiesList || []
  visible.value = true
}

defineExpose({ open })

const analyzedList = computed(() => {
  return selectedCompanies.value.map(c => analyzeCompany(c))
})

const getHeatColor = (score) => {
  if (score >= 60) return '#ea580c' // 高热招
  if (score >= 30) return '#16a34a' // 平稳
  return '#64748b' // 低速
}

// 1. 薪资对比图配置 (分组柱状图: 最低薪资 vs 最高薪资)
const salaryCompareChartOption = computed(() => {
  const list = analyzedList.value
  if (!list.length) return {}

  const names = list.map(c => c.companyName)
  const minSalaries = list.map(c => c.summary.avgSalaryMin || 0)
  const maxSalaries = list.map(c => c.summary.avgSalaryMax || 0)

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        let res = `<div style="font-weight: bold; margin-bottom: 4px;">${params[0].name}</div>`
        params.forEach(p => {
          res += `<div>${p.marker} ${p.seriesName}: <strong>${p.value}K</strong></div>`
        })
        return res
      }
    },
    legend: { top: '3%', data: ['平均底薪', '平均顶薪'] },
    grid: { left: '3%', right: '4%', bottom: '5%', top: '18%', containLabel: true },
    xAxis: {
      type: 'category',
      data: names,
      axisLabel: { interval: 0, rotate: names.some(n => n.length > 5) ? 20 : 0 }
    },
    yAxis: {
      type: 'value',
      name: '月薪 (K)',
      splitLine: { lineStyle: { stroke: '#f1f5f9', type: 'dashed' } }
    },
    series: [
      {
        name: '平均底薪',
        type: 'bar',
        barGap: '20%',
        data: minSalaries,
        itemStyle: { color: '#0284c7', borderRadius: [4, 4, 0, 0] }
      },
      {
        name: '平均顶薪',
        type: 'bar',
        data: maxSalaries,
        itemStyle: { color: '#f59e0b', borderRadius: [4, 4, 0, 0] }
      }
    ]
  }
})

// 2. 招聘活跃度对比图配置
const heatCompareChartOption = computed(() => {
  const list = analyzedList.value
  if (!list.length) return {}

  const names = list.map(c => c.companyName)
  const totalJobs = list.map(c => c.summary.totalJobs)
  const recent30d = list.map(c => c.summary.recent30d)

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    legend: { top: '3%', data: ['总岗位数', '近30天新发'] },
    grid: { left: '3%', right: '4%', bottom: '5%', top: '18%', containLabel: true },
    xAxis: {
      type: 'category',
      data: names,
      axisLabel: { interval: 0, rotate: names.some(n => n.length > 5) ? 20 : 0 }
    },
    yAxis: {
      type: 'value',
      name: '职位数',
      splitLine: { lineStyle: { stroke: '#f1f5f9', type: 'dashed' } }
    },
    series: [
      {
        name: '总岗位数',
        type: 'bar',
        data: totalJobs,
        itemStyle: { color: '#94a3b8', borderRadius: [4, 4, 0, 0] }
      },
      {
        name: '近30天新发',
        type: 'bar',
        data: recent30d,
        itemStyle: { color: '#16a34a', borderRadius: [4, 4, 0, 0] }
      }
    ]
  }
})
</script>

<style scoped>
.compare-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.compare-header-tip {
  background: #f0f9ff;
  border-left: 4px solid #0284c7;
  padding: 10px 16px;
  border-radius: 4px;
  font-size: 13px;
  color: #0369a1;
}

.table-card {
  background: white;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  padding: 16px;
}

.section-title {
  margin: 0 0 14px 0;
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
}

.table-responsive {
  overflow-x: auto;
}

.compare-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 13px;
}

.compare-table th, .compare-table td {
  padding: 12px 14px;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: middle;
}

.compare-table th {
  background: #f8fafc;
  font-weight: 600;
  color: #475569;
}

.dim-label {
  font-weight: 600;
  color: #334155;
  width: 170px;
  background: #f8fafc;
}

.th-company {
  display: flex;
  align-items: center;
  gap: 8px;
}

.th-name {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.metric-strong {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.sub-metric {
  color: #64748b;
  font-size: 12px;
}

.heat-wrapper {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.heat-text {
  display: flex;
  align-items: center;
  gap: 8px;
}

.heat-badge {
  color: white;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.badge-new-7d {
  background: #f0fdf4;
  color: #16a34a;
  border: 1px solid #bbf7d0;
  padding: 3px 8px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 12px;
}

.salary-range-box {
  display: flex;
  align-items: center;
  gap: 6px;
}

.salary-val {
  font-size: 15px;
  font-weight: 700;
  color: #ea580c;
}

.tech-tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-cnt {
  font-size: 11px;
  opacity: 0.75;
}

.city-item {
  color: #475569;
}

.text-muted {
  color: #94a3b8;
  font-size: 12px;
}

.charts-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.chart-box {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px;
}

.compare-chart {
  height: 280px;
  width: 100%;
}

@media (max-width: 900px) {
  .charts-grid {
    grid-template-columns: 1fr;
  }
}
</style>
