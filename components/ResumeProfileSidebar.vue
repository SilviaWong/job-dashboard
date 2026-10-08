<template>
  <aside class="sidebar-profiles">
    <div class="sidebar-header">
      <div class="header-title-row">
        <h3 class="sidebar-title">📄 简历画像库</h3>
        <span class="count-badge">{{ profiles.length }} 份</span>
      </div>
      <el-button type="primary" size="small" class="btn-create" @click="$emit('create')" :disabled="loading">
        + 新建画像版本
      </el-button>
    </div>

    <div class="profile-list" v-loading="loading">
      <div
        v-for="p in profiles"
        :key="p.id"
        class="profile-card"
        :class="{ active: currentId === p.id, isDefault: p.isDefault }"
        @click="$emit('select', p)"
      >
        <div class="card-top-row">
          <span class="profile-card-title" :title="p.title">{{ p.title }}</span>
          <el-tag v-if="p.isDefault" size="small" type="success" effect="dark">默认投递</el-tag>
        </div>
        
        <div class="card-role-row">
          <span class="role-text">{{ p.targetRole || '未设目标岗位' }}</span>
          <span class="char-count">{{ p.contentLength || (p.content?.length || 0) }} 字</span>
        </div>

        <div v-if="p.tags && p.tags.length > 0" class="card-tags-row">
          <span v-for="tag in p.tags.slice(0, 3)" :key="tag" class="mini-tag">{{ tag }}</span>
          <span v-if="p.tags.length > 3" class="more-tag">+{{ p.tags.length - 3 }}</span>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup>
defineProps({
  profiles: {
    type: Array,
    default: () => []
  },
  currentId: {
    type: String,
    default: ''
  },
  loading: {
    type: Boolean,
    default: false
  }
})

defineEmits(['select', 'create'])
</script>

<style scoped>
.sidebar-profiles {
  width: 300px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #e2e8f0;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.header-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sidebar-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.count-badge {
  font-size: 12px;
  color: #64748b;
  background: #f1f5f9;
  padding: 2px 8px;
  border-radius: 12px;
}

.btn-create {
  width: 100%;
}

.profile-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.profile-card {
  padding: 12px 14px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
}

.profile-card:hover {
  background: #f1f5f9;
  transform: translateY(-1px);
}

.profile-card.active {
  background: #eff6ff;
  border-color: #3b82f6;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.12);
}

.card-top-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
}

.profile-card-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-role-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #64748b;
}

.char-count {
  color: #94a3b8;
}

.card-tags-row {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 2px;
}

.mini-tag {
  font-size: 10px;
  background: #e2e8f0;
  color: #475569;
  padding: 1px 5px;
  border-radius: 4px;
}

.more-tag {
  font-size: 10px;
  color: #94a3b8;
}
</style>
