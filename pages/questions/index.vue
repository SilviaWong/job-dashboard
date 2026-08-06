<template>
  <div class="questions-page">
    <el-card shadow="never" class="table-card">
      <template #header>
        <div class="card-header">
          <h2 class="header-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
              <path d="M9.001 7.002H15" />
              <path d="M9.001 11.002H15" />
            </svg>
            题库管理
          </h2>
          <div class="header-actions">
            <el-input
              v-model="searchQuery"
              placeholder="搜索题干或标签..."
              style="width: 250px"
              clearable
              @keyup.enter="handleSearch"
              @clear="handleSearch"
            />
            <el-button color="#28a745" style="color: white; border: none; border-radius: 6px;" @click="handleImportExcel">
              📥 导入 Excel
            </el-button>
            <el-button type="primary" style="border: none; border-radius: 6px;" @click="openDialog()">
              ➕ 新增题目
            </el-button>
            <el-popconfirm title="确定要清空所有题目吗？此操作不可恢复！" @confirm="clearQuestionBank">
              <template #reference>
                <el-button color="#dc3545" style="color: white; border: none; border-radius: 6px;">
                  🗑️ 清空题库
                </el-button>
              </template>
            </el-popconfirm>
          </div>
        </div>
      </template>

      <el-table :data="questions" v-loading="loading" style="width: 100%" row-key="id">
        <el-table-column prop="serialNo" label="序号" width="80" align="center">
          <template #default="{ row, $index }">
            {{ row.serialNo || $index + 1 }}
          </template>
        </el-table-column>

        <el-table-column prop="title" label="面试题目" min-width="250">
          <template #default="{ row }">
            <div class="question-title">{{ row.title }}</div>
          </template>
        </el-table-column>

        <el-table-column prop="themeCategory" label="主题分类" width="120">
          <template #default="{ row }">
            <span style="color: #555;">{{ row.themeCategory || '-' }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="subCategory" label="二级分类" width="120">
          <template #default="{ row }">
            <span style="color: #555;">{{ row.subCategory || '-' }}</span>
          </template>
        </el-table-column>
        
        <el-table-column prop="tags" label="标签" width="200">
          <template #default="{ row }">
            <div class="tags-container" v-if="getParsedTags(row.tags).length > 0">
              <span class="custom-tag" v-for="(tag, idx) in getParsedTags(row.tags)" :key="idx">
                {{ tag }}
              </span>
            </div>
            <span v-else class="text-gray-400">-</span>
          </template>
        </el-table-column>
        
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openDialog(row)">编辑</el-button>
            <el-popconfirm title="确定要删除这道题吗？" @confirm="deleteQuestion(row.id)">
              <template #reference>
                <el-button link type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-container" v-if="total > 0">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="fetchQuestions"
          @current-change="fetchQuestions"
        />
      </div>
      <div v-else class="empty-state">
        <p>题库为空，点击右上角“新增题目”开始积累吧！</p>
      </div>
    </el-card>

    <!-- Dialog -->
    <el-dialog 
      v-model="dialogVisible" 
      :title="isEdit ? '编辑题目' : '新增题目'"
      width="800px"
      destroy-on-close
      custom-class="qb-modal"
    >
      <el-form :model="formData" :rules="rules" ref="formRef" label-position="top">
        <div style="display: flex; gap: 12px;">
          <el-form-item label="序号" prop="serialNo" style="flex: 0 0 80px;">
            <el-input v-model="formData.serialNo" placeholder="例如: 1" />
          </el-form-item>
          <el-form-item label="题干" prop="title" style="flex: 1;">
            <el-input 
              v-model="formData.title" 
              type="textarea" 
              :rows="2" 
              placeholder="请输入面试题目..." 
              style="font-size: 16px;" 
            />
          </el-form-item>
        </div>
        
        <div style="display: flex; gap: 12px;">
          <el-form-item label="主题分类" prop="themeCategory" style="flex: 1;">
            <el-input v-model="formData.themeCategory" placeholder="例如: 前端" />
          </el-form-item>
          <el-form-item label="二级分类" prop="subCategory" style="flex: 1;">
            <el-input v-model="formData.subCategory" placeholder="例如: JavaScript" />
          </el-form-item>
          <el-form-item label="标签 (逗号或回车分隔)" prop="tags" style="flex: 1;">
            <el-select
              v-model="formData.tags"
              multiple
              filterable
              allow-create
              default-first-option
              placeholder="例如: 闭包, 高频"
              style="width: 100%"
            >
              <el-option label="前端" value="前端" />
              <el-option label="后端" value="后端" />
              <el-option label="算法" value="算法" />
              <el-option label="八股文" value="八股文" />
            </el-select>
          </el-form-item>
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-weight: 500; font-size: 14px; color: #606266;">答案解析</span>
          <el-button size="small" color="#f5a623" style="color: white; border: none;" @click="aiAnswer">
            🤖 AI 帮我答 (结合简历)
          </el-button>
        </div>
        <el-input 
          v-model="formData.answer" 
          type="textarea" 
          :rows="8"
          placeholder="在此输入你的答案或让 AI 生成..." 
        />
      </el-form>
      
      <template #footer>
        <span class="dialog-footer" style="display: flex; justify-content: flex-end; gap: 12px;">
          <el-button v-if="isEdit" color="#e74c3c" style="color: white; margin-right: auto; border: none;" @click="deleteQuestion(formData.id, true)">
            🗑️ 删除该题
          </el-button>
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveQuestion" :loading="saving">
            保存
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

const questions = ref([])
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const searchQuery = ref('')

const dialogVisible = ref(false)
const saving = ref(false)
const isEdit = ref(false)
const formRef = ref(null)

const formData = ref({
  id: '',
  serialNo: '',
  title: '',
  themeCategory: '',
  subCategory: '',
  tags: [],
  answer: ''
})

const rules = {
  title: [{ required: true, message: '请输入题目', trigger: 'blur' }]
}

const getParsedTags = (tagsStr) => {
  if (!tagsStr) return []
  try {
    return JSON.parse(tagsStr)
  } catch (e) {
    return []
  }
}

const fetchQuestions = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: page.value,
      pageSize: pageSize.value,
      keyword: searchQuery.value
    })
    
    const res = await $fetch(`/api/questions?${params.toString()}`)
    if (res && res.success) {
      questions.value = res.data || []
      total.value = res.total || 0
    }
  } catch (error) {
    console.error('Failed to fetch questions:', error)
    ElMessage.error('加载题库失败')
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  page.value = 1
  fetchQuestions()
}

const handleImportExcel = () => {
  ElMessage.info('导入 Excel 功能尚未在此版本支持')
}

const clearQuestionBank = async () => {
  try {
    // We would need an API endpoint to delete all. For now we will just show a message.
    ElMessage.info('清空题库 API 尚未实现，请先逐条删除。')
  } catch (error) {
    ElMessage.error('清空失败')
  }
}

const openDialog = (row = null) => {
  if (row) {
    isEdit.value = true
    formData.value = {
      id: row.id,
      serialNo: row.serialNo || '',
      title: row.title,
      themeCategory: row.themeCategory || '',
      subCategory: row.subCategory || '',
      tags: getParsedTags(row.tags),
      answer: row.answer || ''
    }
  } else {
    isEdit.value = false
    formData.value = {
      id: '',
      serialNo: '',
      title: '',
      themeCategory: '',
      subCategory: '',
      tags: [],
      answer: ''
    }
  }
  dialogVisible.value = true
}

const aiAnswer = () => {
  ElMessage.info('正在调用 AI，请稍候... (功能开发中)')
}

const saveQuestion = async () => {
  if (!formRef.value) return
  
  await formRef.value.validate(async (valid) => {
    if (valid) {
      saving.value = true
      try {
        const url = isEdit.value 
          ? `/api/questions/${formData.value.id}` 
          : '/api/questions'
        
        const method = isEdit.value ? 'PUT' : 'POST'
        
        const res = await $fetch(url, {
          method,
          body: {
            serialNo: formData.value.serialNo,
            title: formData.value.title,
            themeCategory: formData.value.themeCategory,
            subCategory: formData.value.subCategory,
            tags: formData.value.tags,
            answer: formData.value.answer
          }
        })
        
        if (res && res.success) {
          ElMessage.success(isEdit.value ? '更新成功' : '添加成功')
          dialogVisible.value = false
          fetchQuestions()
        } else {
          ElMessage.error(res?.error || '保存失败')
        }
      } catch (error) {
        console.error('Save failed:', error)
        ElMessage.error('保存失败')
      } finally {
        saving.value = false
      }
    }
  })
}

const deleteQuestion = async (id, closeDialog = false) => {
  try {
    const res = await $fetch(`/api/questions/${id}`, {
      method: 'DELETE'
    })
    
    if (res && res.success) {
      ElMessage.success('删除成功')
      if (closeDialog) {
        dialogVisible.value = false
      }
      fetchQuestions()
    } else {
      ElMessage.error(res?.error || '删除失败')
    }
  } catch (error) {
    console.error('Delete failed:', error)
    ElMessage.error('删除失败')
  }
}

onMounted(() => {
  fetchQuestions()
})
</script>

<style scoped>
.questions-page {
  height: 100%;
}
.table-card {
  border-radius: var(--radius-m, 14px);
  border: 1px solid rgba(0, 0, 0, 0.04);
  box-shadow: var(--shadow-card, 0 4px 24px rgba(0,0,0,0.04));
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.header-title {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary, #1D1D1F);
}
.header-actions {
  display: flex;
  gap: 10px;
}
.question-title {
  font-weight: 500;
  color: var(--text-primary, #1D1D1F);
  font-size: 14px;
}
.tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.custom-tag {
  background: #F2F2F7;
  color: #636366;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}
.pagination-container {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
.empty-state {
  text-align: center;
  padding: 40px;
  color: #888;
}
</style>
