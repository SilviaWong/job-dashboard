<template>
  <div class="kanban-page">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span style="font-size: 18px; font-weight: 600;">📌 投递追踪看板</span>
          <el-button type="primary" size="small" @click="fetchJobs" :loading="loading">
            刷新数据
          </el-button>
        </div>
      </template>

      <div class="kanban-board">
        <div 
          v-for="column in columns" 
          :key="column.id" 
          class="kanban-column"
          @dragover.prevent
          @dragenter.prevent
          @drop="onDrop($event, column.id)"
        >
          <div class="column-header">
            <h3>{{ column.title }}</h3>
            <span class="count">{{ getJobsByStatus(column.id).length }}</span>
          </div>
          
          <div class="kanban-cards">
            <el-card 
              v-for="job in getJobsByStatus(column.id)" 
              :key="job.jobId"
              class="job-card"
              shadow="hover"
              draggable="true"
              @dragstart="onDragStart($event, job)"
            >
              <div class="card-content">
                <div class="job-title">{{ job.title }}</div>
                <div class="job-company">{{ job.companyName }}</div>
                <div class="job-salary">{{ job.salary }}</div>
              </div>
            </el-card>
            
            <div v-if="getJobsByStatus(column.id).length === 0" class="empty-column">
              拖拽职位到此处
            </div>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'

const loading = ref(false)
const jobs = ref([])

const columns = [
  { id: 'to-apply', title: '待投递' },
  { id: 'applied', title: '已投递' },
  { id: 'interview-1', title: '一面' },
  { id: 'interview-2', title: '二面' },
  { id: 'offer', title: 'Offer' }
]

const fetchJobs = async () => {
  loading.value = true
  try {
    // 增加 pageSize 确保能拉取所有看板相关的职位
    const res = await $fetch('/api/jobs?status=all&pageSize=1000')
    if (res.success) {
      const kanbanStatuses = columns.map(c => c.id)
      
      const processedJobs = res.data.map(j => {
        // 参考扩展程序逻辑：如果没有看板状态，但被收藏了，默认进 'to-apply' (待投递)
        if (!kanbanStatuses.includes(j.status) && j.isFavorited) {
          return { ...j, status: 'to-apply' }
        }
        return j
      })

      // Filter out jobs that don't belong in the kanban
      jobs.value = processedJobs.filter(j => kanbanStatuses.includes(j.status))
    }
  } catch (error) {
    ElMessage.error('获取职位数据失败')
  } finally {
    loading.value = false
  }
}

const getJobsByStatus = (status) => {
  return jobs.value.filter(job => job.status === status)
}

const onDragStart = (event, job) => {
  event.dataTransfer.dropEffect = 'move'
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('jobId', job.id)
}

const onDrop = async (event, newStatus) => {
  const id = event.dataTransfer.getData('jobId')
  if (!id) return
  
  const job = jobs.value.find(j => j.id === id)
  if (!job || job.status === newStatus) return

  // Optimistic update
  const oldStatus = job.status
  job.status = newStatus

  try {
    const res = await $fetch(`/api/jobs/${id}/status`, {
      method: 'PUT',
      body: { status: newStatus }
    })
    
    if (res.success) {
      ElMessage.success('状态更新成功')
    } else {
      // Revert on failure
      job.status = oldStatus
      ElMessage.error('状态更新失败')
    }
  } catch (error) {
    job.status = oldStatus
    ElMessage.error('网络请求错误')
  }
}

onMounted(() => {
  fetchJobs()
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.kanban-board {
  display: flex;
  gap: 20px;
  overflow-x: auto;
  min-height: calc(100vh - 200px);
  padding-bottom: 20px;
}
.kanban-column {
  flex: 1;
  min-width: 250px;
  background-color: #f4f4f5;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
}
.column-header {
  padding: 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid #e4e7ed;
}
.column-header h3 {
  margin: 0;
  font-size: 16px;
  color: #303133;
}
.count {
  background: #fff;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: bold;
  color: #909399;
}
.kanban-cards {
  padding: 15px;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 15px;
}
.job-card {
  cursor: grab;
}
.job-card:active {
  cursor: grabbing;
}
.job-title {
  font-weight: 600;
  font-size: 14px;
  color: #303133;
  margin-bottom: 5px;
}
.job-company {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}
.job-salary {
  font-size: 13px;
  color: #f56c6c;
  font-weight: 500;
}
.empty-column {
  text-align: center;
  color: #c0c4cc;
  padding: 20px 0;
  border: 2px dashed #dcdfe6;
  border-radius: 4px;
}
</style>
