<template>
  <div class="dashboard-page">
    <div class="page-header">
      <h2>数据看板</h2>
      <p class="subtitle">共分析 {{ totalJobs }} 个职位</p>
    </div>

    <div v-if="loading" class="loading-state">
      <el-skeleton :rows="5" animated />
    </div>
    
    <div v-else-if="error" class="error-state">
      <el-alert :title="error" type="error" show-icon />
    </div>

    <div v-else class="dashboard-container">
      <div class="charts-row">
        <!-- Salary Chart -->
        <div class="chart-card">
          <h3 class="chart-title">平均薪资分布 (区间)</h3>
          <ClientOnly>
            <v-chart class="chart" :option="salaryChartOption" autoresize />
          </ClientOnly>
        </div>

        <!-- Experience Chart -->
        <div class="chart-card">
          <h3 class="chart-title">经验要求占比</h3>
          <ClientOnly>
            <v-chart class="chart" :option="expChartOption" autoresize />
          </ClientOnly>
        </div>
      </div>

      <div class="charts-row full-width">
        <!-- Skills WordCloud -->
        <div class="chart-card">
          <h3 class="chart-title">热门技能词云</h3>
          <ClientOnly>
            <v-chart class="chart wordcloud-chart" :option="skillsChartOption" autoresize />
          </ClientOnly>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'

// Echarts setup
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, PieChart } from 'echarts/charts'
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
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
])

const loading = ref(true)
const error = ref(null)
const statsData = ref(null)
const totalJobs = ref(0)

onMounted(async () => {
  try {
    // Dynamically import echarts-wordcloud on the client side to prevent SSR errors
    await import('echarts-wordcloud')
    
    const response = await $fetch('/api/dashboard')
    if (response?.success) {
      statsData.value = response.data
      totalJobs.value = response.data.totalJobs
    } else {
      error.value = response?.error || 'Failed to fetch dashboard data'
    }
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})

// Salary Chart Options
const salaryChartOption = computed(() => {
  if (!statsData.value) return {}
  const data = statsData.value.salary
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      data: Object.keys(data),
      axisTick: { alignWithLabel: true }
    },
    yAxis: { type: 'value' },
    series: [
      {
        name: '职位数量',
        type: 'bar',
        barWidth: '60%',
        data: Object.values(data),
        itemStyle: { color: '#3498db' }
      }
    ]
  }
})

// Experience Chart Options
const expChartOption = computed(() => {
  if (!statsData.value) return {}
  const data = statsData.value.experience
  const pieData = Object.keys(data).map(key => ({
    name: key,
    value: data[key]
  }))
  return {
    tooltip: { trigger: 'item' },
    legend: { top: '5%', left: 'center' },
    series: [
      {
        name: '经验要求',
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: '#fff',
          borderWidth: 2
        },
        label: { show: false, position: 'center' },
        emphasis: {
          label: { show: true, fontSize: 18, fontWeight: 'bold' }
        },
        labelLine: { show: false },
        data: pieData
      }
    ],
    color: ['#e74c3c', '#f1c40f', '#2ecc71', '#9b59b6', '#95a5a6']
  }
})

// Skills WordCloud Options
const skillsChartOption = computed(() => {
  if (!statsData.value) return {}
  const data = statsData.value.skills
  
  // Sort and take top 80
  const sortedSkills = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 80)
    
  const wordCloudData = sortedSkills.map(([name, value]) => ({
    name,
    value
  }))

  return {
    tooltip: { show: true },
    series: [{
      type: 'wordCloud',
      shape: 'circle',
      keepAspect: false,
      left: 'center',
      top: 'center',
      width: '100%',
      height: '100%',
      right: null,
      bottom: null,
      sizeRange: [14, 50],
      rotationRange: [-45, 90],
      rotationStep: 45,
      gridSize: 8,
      drawOutOfBound: false,
      layoutAnimation: true,
      textStyle: {
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        fontWeight: 'bold',
        color: function () {
          const colors = ['#3498db', '#e74c3c', '#2ecc71', '#e67e22', '#9b59b6', '#34495e', '#1abc9c', '#e84393', '#6c5ce7', '#00cec9']
          return colors[Math.floor(Math.random() * colors.length)]
        }
      },
      emphasis: {
        focus: 'self',
        textStyle: {
          textShadowBlur: 10,
          textShadowColor: '#333'
        }
      },
      data: wordCloudData
    }]
  }
})
</script>

<style scoped>
.dashboard-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.page-header {
  display: flex;
  align-items: baseline;
  gap: 16px;
}

.page-header h2 {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0;
}

.subtitle {
  color: var(--text-secondary);
  font-size: 14px;
  margin: 0;
}

.dashboard-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.charts-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.charts-row.full-width {
  grid-template-columns: 1fr;
}

.chart-card {
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  border: 1px solid var(--border-color);
}

.chart-title {
  margin-top: 0;
  margin-bottom: 20px;
  text-align: center;
  font-size: 16px;
  color: var(--text-color);
  font-weight: 600;
}

.chart {
  height: 350px;
  width: 100%;
}

.wordcloud-chart {
  height: 400px;
}

.loading-state, .error-state {
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}
</style>
