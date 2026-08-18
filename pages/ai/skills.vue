<template>
  <div class="skills-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">Agent 技能管理</h1>
        <p class="page-subtitle">动态添加、修改和管理求职 Agent 技能。支持使用占位符变量注入职位 JD 和个人简历。</p>
      </div>
      <el-button type="primary" @click="handleCreate">
        <el-icon><Plus /></el-icon>&nbsp;新增技能
      </el-button>
    </div>

    <!-- 技能列表 -->
    <el-card class="box-card" shadow="never">
      <el-table :data="skills" style="width: 100%" v-loading="loading">
        <el-table-column prop="name" label="技能名称" width="180">
          <template #default="{ row }">
            <div style="font-weight: 500; color: #1e293b;">
              <el-icon v-if="row.name.includes('匹配')" color="#10b981"><Check /></el-icon>
              <el-icon v-else color="#0ea5e9"><Wand2 /></el-icon>
              &nbsp;{{ row.name }}
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述" />
        <el-table-column prop="isActive" label="状态" width="100">
          <template #default="{ row }">
            <el-switch
              v-model="row.isActive"
              inline-prompt
              active-text="开启"
              inactive-text="关闭"
              @change="handleStatusChange(row)"
            />
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleEdit(row)">
              <el-icon><Edit /></el-icon>&nbsp;编辑
            </el-button>
            <el-popconfirm
              title="确定要删除这个技能吗？"
              confirm-button-text="删除"
              cancel-button-text="取消"
              confirm-button-type="danger"
              @confirm="handleDelete(row)"
            >
              <template #reference>
                <el-button type="danger" link>
                  <el-icon><Delete /></el-icon>&nbsp;删除
                </el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 编辑/新增 弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑技能' : '新增技能'"
      width="650px"
      destroy-on-close
    >
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px" label-position="top">
        <el-form-item label="技能名称" prop="name">
          <el-input v-model="form.name" placeholder="例如：提炼公司亮点" />
        </el-form-item>
        
        <el-form-item label="技能描述" prop="description">
          <el-input 
            v-model="form.description" 
            type="textarea" 
            :rows="2"
            placeholder="简短描述该技能的用途，会显示在表格中" 
          />
        </el-form-item>

        <div class="info-alert">
          <el-icon><Info /></el-icon>
          <div class="info-content">
            <p><strong>支持的占位符（发给模型前会自动替换）：</strong></p>
            <ul>
              <li><code v-pre>{{JD_TEXT}}</code>：当前职位的完整描述（JD）</li>
              <li><code v-pre>{{RESUME_TEXT}}</code>：系统设置中你当前配置的个人简历</li>
            </ul>
          </div>
        </div>

        <el-form-item label="系统设定 (System Prompt)" prop="systemPrompt">
          <el-input 
            v-model="form.systemPrompt" 
            type="textarea" 
            :rows="6"
            placeholder="大模型的角色设定。例如：你是一个资深的求职专家..." 
          />
        </el-form-item>

        <el-form-item label="用户提问 (User Prompt)" prop="userPrompt">
          <el-input 
            v-model="form.userPrompt" 
            type="textarea" 
            :rows="6"
            placeholder="具体的提问内容。记得使用占位符注入数据..." 
          />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="submitForm">
            确定
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { Plus, Edit, Delete, Wand2, Check, Info } from 'lucide-vue-next'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'

const skills = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)
const formRef = ref(null)

const form = reactive({
  id: '',
  name: '',
  description: '',
  systemPrompt: '',
  userPrompt: '',
  isActive: true
})

const rules = {
  name: [{ required: true, message: '请输入技能名称', trigger: 'blur' }],
  systemPrompt: [{ required: true, message: '请输入系统设定', trigger: 'blur' }],
  userPrompt: [{ required: true, message: '请输入用户提问', trigger: 'blur' }]
}

const fetchSkills = async () => {
  loading.value = true
  try {
    const res = await $fetch('/api/skills/list')
    if (res && res.success) {
      skills.value = res.data
    } else {
      ElMessage.error(res.error || '加载失败')
    }
  } catch (err) {
    ElMessage.error('服务异常')
  } finally {
    loading.value = false
  }
}

const formatDate = (date) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

const handleCreate = () => {
  isEdit.value = false
  form.id = ''
  form.name = ''
  form.description = ''
  form.systemPrompt = ''
  form.userPrompt = ''
  form.isActive = true
  dialogVisible.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  form.id = row.id
  form.name = row.name
  form.description = row.description
  form.systemPrompt = row.systemPrompt
  form.userPrompt = row.userPrompt
  form.isActive = row.isActive
  dialogVisible.value = true
}

const handleStatusChange = async (row) => {
  try {
    await $fetch(`/api/skills/${row.id}`, {
      method: 'PUT',
      body: { ...row }
    })
    ElMessage.success('状态更新成功')
  } catch (err) {
    row.isActive = !row.isActive
    ElMessage.error('更新失败')
  }
}

const handleDelete = async (row) => {
  try {
    const res = await $fetch(`/api/skills/${row.id}`, { method: 'DELETE' })
    if (res.success) {
      ElMessage.success('删除成功')
      fetchSkills()
    } else {
      ElMessage.error(res.error || '删除失败')
    }
  } catch (err) {
    ElMessage.error('服务异常')
  }
}

const submitForm = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (valid) {
      saving.value = true
      try {
        const url = isEdit.value ? `/api/skills/${form.id}` : '/api/skills/index'
        const method = isEdit.value ? 'PUT' : 'POST'
        
        const res = await $fetch(url, {
          method,
          body: {
            name: form.name,
            description: form.description,
            systemPrompt: form.systemPrompt,
            userPrompt: form.userPrompt,
            isActive: form.isActive
          }
        })

        if (res.success) {
          ElMessage.success(isEdit.value ? '修改成功' : '新增成功')
          dialogVisible.value = false
          fetchSkills()
        } else {
          ElMessage.error(res.error || '保存失败')
        }
      } catch (err) {
        ElMessage.error('服务异常')
      } finally {
        saving.value = false
      }
    }
  })
}

onMounted(() => {
  fetchSkills()
})
</script>

<style scoped>
.skills-page {
  max-width: 1000px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-title {
  margin: 0 0 8px 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--text-color);
}

.page-subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.box-card {
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.info-alert {
  display: flex;
  gap: 12px;
  background-color: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
}

.info-alert .el-icon {
  color: #0284c7;
  font-size: 20px;
  margin-top: 2px;
}

.info-content p {
  margin: 0 0 8px 0;
  color: #0369a1;
  font-size: 14px;
}

.info-content ul {
  margin: 0;
  padding-left: 20px;
  color: #0c4a6e;
  font-size: 13px;
}

.info-content li {
  margin-bottom: 4px;
}

.info-content code {
  background-color: #e0f2fe;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  font-weight: bold;
}
</style>
