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
          <span>招聘数据本地管理后台 v2.0</span>
        </div>
      </el-header>
      
      <el-main class="main-content">
        <slot />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ClipboardList, Building2, MapPin, Bot, BookOpen, Briefcase, FileText, LayoutDashboard, Wand2, ShieldBan } from 'lucide-vue-next'

const route = useRoute()
const activeMenu = computed(() => {
  if (route.path.startsWith('/jobs')) return '/jobs'
  if (route.path.startsWith('/companies')) return '/companies'
  if (route.path.startsWith('/dashboard')) return '/dashboard'
  if (route.path.startsWith('/kanban')) return '/kanban'
  if (route.path.startsWith('/blacklist')) return '/blacklist'
  if (route.path.startsWith('/ai')) return '/ai'
  if (route.path.startsWith('/questions')) return '/questions'
  return '/jobs'
})
</script>

<style scoped>
.layout-container {
  height: 100vh;
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
  font-weight: 600;
  font-size: 14px;
  color: var(--text-secondary);
}

.main-content {
  padding: 0 36px 36px 36px;
  background-color: transparent;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
</style>
