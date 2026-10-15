<template>
  <el-container class="layout-container">
    <el-aside width="240px" class="sidebar">
      <div class="logo">
        <Briefcase class="logo-icon" :size="24" />
        <h2>Job Dashboard</h2>
      </div>
      <el-menu
        :default-active="activeMenu"
        class="el-menu-vertical"
        router
      >
        <el-menu-item index="/jobs">
          <el-icon><ClipboardList /></el-icon>
          <span>职位大厅</span>
        </el-menu-item>
        
        <el-menu-item index="/companies">
          <el-icon><Building2 /></el-icon>
          <span>企业全景</span>
        </el-menu-item>
        
        <el-menu-item index="/dashboard">
          <el-icon><LayoutDashboard /></el-icon>
          <span>数据看板</span>
        </el-menu-item>
        
        <el-menu-item index="/kanban">
          <el-icon><MapPin /></el-icon>
          <span>投递追踪</span>
        </el-menu-item>
        
        <el-menu-item index="/interviews">
          <el-icon><Calendar /></el-icon>
          <span>面试复盘</span>
        </el-menu-item>
        
        <el-menu-item index="/ai/model">
          <el-icon><Bot /></el-icon>
          <span>大模型管理</span>
        </el-menu-item>
        
        <el-menu-item index="/ai/resume">
          <el-icon><FileText /></el-icon>
          <span>简历管理</span>
        </el-menu-item>

        <!-- Skills管理先屏蔽掉：目前功能还未完善，效果不好-->
        <!-- <el-menu-item index="/ai/skills">
          <el-icon><Wand2 /></el-icon>
          <span>Skills管理</span>
        </el-menu-item> -->
        
        <el-menu-item index="/questions">
          <el-icon><BookOpen /></el-icon>
          <span>题库管理</span>
        </el-menu-item>

        <el-menu-item index="/blacklist">
          <el-icon><ShieldBan /></el-icon>
          <span>企业黑名单</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    
    <el-container>
      <el-header class="header">
        <div class="header-content">
          <el-button 
            type="primary" 
            size="small" 
            round 
            class="copilot-header-btn"
            @click="openCopilot()"
          >
            <Sparkles :size="14" style="margin-right: 6px;" />
            Job Copilot 智能管家
          </el-button>
          <span class="header-divider">|</span>
          <span class="header-title">招聘数据本地管理后台 v2.0</span>
        </div>
      </el-header>
      
      <el-main class="main-content">
        <slot />
      </el-main>
    </el-container>

    <!-- 悬浮唤起智能体按钮 -->
    <div class="floating-copilot-btn" @click="openCopilot()" title="打开 Job Copilot 智能管家">
      <div class="floating-btn-inner">
        <Bot :size="20" class="copilot-icon" />
        <span class="copilot-text">Job Copilot</span>
        <span class="copilot-pulse"></span>
      </div>
    </div>

    <!-- 全局挂载的 JobCopilotDrawer -->
    <JobCopilotDrawer ref="copilotDrawerRef" @open-job="handleOpenJob" />
  </el-container>
</template>

<script setup>
import { ref, computed, provide } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { 
  ClipboardList, 
  Building2, 
  MapPin, 
  Bot, 
  BookOpen, 
  Briefcase, 
  FileText, 
  LayoutDashboard, 
  Wand2, 
  ShieldBan, 
  Calendar,
  Sparkles
} from 'lucide-vue-next'
import JobCopilotDrawer from '~/components/JobCopilotDrawer.vue'

const route = useRoute()
const router = useRouter()
const copilotDrawerRef = ref(null)

const openCopilot = (prompt) => {
  copilotDrawerRef.value?.open(prompt)
}

provide('openCopilot', openCopilot)

const handleOpenJob = (jobId) => {
  router.push({ path: '/jobs', query: { openJobId: jobId, t: Date.now().toString() } })
}

const activeMenu = computed(() => {
  if (route.path.startsWith('/jobs')) return '/jobs'
  if (route.path.startsWith('/companies')) return '/companies'
  if (route.path.startsWith('/dashboard')) return '/dashboard'
  if (route.path.startsWith('/kanban')) return '/kanban'
  if (route.path.startsWith('/interviews')) return '/interviews'
  if (route.path.startsWith('/blacklist')) return '/blacklist'
  if (route.path.startsWith('/ai')) return '/ai'
  if (route.path.startsWith('/questions')) return '/questions'
  return '/jobs'
})
</script>

<style scoped>
.layout-container {
  height: 100vh;
  position: relative;
}

.sidebar {
  background-color: var(--sidebar-bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
}

.logo {
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-color);
}

.logo h2 {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
  color: var(--text-color);
}

.el-menu-vertical {
  border-right: none;
  background: transparent;
  flex: 1;
  padding: 10px 12px;
}

:deep(.el-menu-item) {
  height: 44px;
  line-height: 44px;
  border-radius: var(--radius-s);
  margin-bottom: 4px;
  color: var(--sidebar-text);
  font-weight: 500;
  transition: all 0.2s;
}

:deep(.el-menu-item:hover) {
  background-color: var(--sidebar-hover) !important;
  color: var(--text-primary);
}

:deep(.el-menu-item.is-active) {
  background-color: var(--sidebar-active) !important;
  color: var(--text-color);
  font-weight: 600;
}

.header {
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 36px;
  height: 60px;
}

.header-content {
  display: flex;
  align-items: center;
  font-weight: 600;
  font-size: 14px;
  color: var(--text-secondary);
}

.copilot-header-btn {
  background: linear-gradient(135deg, #007AFF 0%, #5856D6 100%);
  border: none;
  color: #FFFFFF;
  font-weight: 500;
  box-shadow: 0 2px 8px rgba(0, 122, 255, 0.25);
  transition: all 0.2s;
  display: flex;
  align-items: center;
}

.copilot-header-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 122, 255, 0.35);
  color: #FFFFFF;
}

.header-divider {
  margin: 0 14px;
  color: var(--border-color);
  opacity: 0.6;
}

.header-title {
  font-size: 13px;
  color: var(--text-secondary);
}

.main-content {
  padding: 0 36px 36px 36px;
  background-color: transparent;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* 悬浮唤起按钮 */
.floating-copilot-btn {
  position: fixed;
  right: 28px;
  bottom: 28px;
  z-index: 1000;
  cursor: pointer;
  border-radius: 30px;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 122, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.85);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.floating-copilot-btn:hover {
  transform: translateY(-3px) scale(1.02);
  box-shadow: 0 12px 36px rgba(0, 122, 255, 0.24);
}

.floating-btn-inner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  position: relative;
}

.copilot-icon {
  color: #007AFF;
}

.copilot-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color, #1D1D1F);
}

.copilot-pulse {
  position: absolute;
  top: 9px;
  left: 23px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #34C759;
  border: 1.5px solid #FFFFFF;
}
</style>
