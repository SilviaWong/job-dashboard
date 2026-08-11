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
            <el-select
              v-model="searchDomain"
              placeholder="按技术领域筛选..."
              clearable
              style="width: 180px"
              @change="handleSearch"
            >
              <!-- TODO: 可以改成动态从后端获取领域列表，这里为了演示简单写死几个，或者只依赖输入 -->
              <el-option label="Java基础" value="Java基础" />
              <el-option label="Spring" value="Spring" />
              <el-option label="数据库" value="数据库" />
              <el-option label="前端" value="前端" />
              <el-option label="其他" value="其他" />
            </el-select>
            <el-input
              v-model="searchQuery"
              placeholder="搜索标准问题或变体题目..."
              style="width: 250px"
              clearable
              @keyup.enter="handleSearch"
              @clear="handleSearch"
            />
            <el-button type="primary" style="border: none; border-radius: 6px;" @click="openDialog()">
              ➕ 新增题目
            </el-button>
          </div>
        </div>
      </template>

      <el-table :data="questions" v-loading="loading" style="width: 100%" row-key="id">
        <!-- 展开行，显示变体真题和标准答案 -->
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="expand-content">
              <div class="core-points-section" style="margin-bottom: 16px;">
                <h4>核心考点：</h4>
                <div class="answer-box" style="background: #fdfdfd;">
                  <p v-if="row.corePoints" style="white-space: pre-wrap; margin: 0;">{{ row.corePoints }}</p>
                  <p v-else class="text-gray-400" style="margin: 0;">暂无核心考点</p>
                </div>
              </div>
              <div class="answer-section" style="margin-bottom: 16px;">
                <h4>标准答案要点：</h4>
                <div class="answer-box">
                  <p v-if="row.answerKey" style="white-space: pre-wrap; margin: 0;">{{ row.answerKey }}</p>
                  <p v-else class="text-gray-400" style="margin: 0;">暂无答案要点</p>
                </div>
              </div>
              <div class="ai-answer-section" style="margin-bottom: 16px;" v-if="row.aiAnswer">
                <h4>🤖 AI 个性化解答 (结合简历)：</h4>
                <div class="answer-box" style="background: #f0f9eb; border-left: 4px solid #67c23a;">
                  <p style="white-space: pre-wrap; margin: 0;">{{ row.aiAnswer }}</p>
                </div>
              </div>
              <div class="variants-section">
                <h4>面试变体真题 ({{ row.variants?.length || 0 }})：</h4>
                <el-table :data="row.variants" size="small" border v-if="row.variants?.length">
                  <el-table-column prop="serialNo" label="序号" width="80" align="center" />
                  <el-table-column prop="title" label="面试题目" />
                </el-table>
                <div v-else class="text-gray-400" style="padding: 10px;">暂无收集到的真题变体</div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="title" label="标准问题" min-width="250">
          <template #default="{ row }">
            <div class="question-title">{{ row.title }}</div>
          </template>
        </el-table-column>

        <el-table-column prop="domain" label="技术领域" width="140">
          <template #default="{ row }">
            <span style="color: #333;">{{ row.domain || '-' }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="categoryTags" label="分类标签" min-width="180">
          <template #default="{ row }">
            <div v-if="row.categoryTags" style="display: flex; flex-wrap: wrap; gap: 4px;">
              <el-tag 
                v-for="(tag, idx) in row.categoryTags.split('/').filter(t => t.trim() !== '')" 
                :key="idx" 
                size="small" 
                type="info" 
                disable-transitions
              >
                {{ tag.trim() }}
              </el-tag>
            </div>
            <span v-else class="text-gray-400">-</span>
          </template>
        </el-table-column>

        <el-table-column label="考察频次" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="(row.variants?.length || 0) >= 5 ? 'danger' : ((row.variants?.length || 0) >= 2 ? 'warning' : 'info')" size="small">
              {{ row.variants?.length || 0 }} 次
            </el-tag>
          </template>
        </el-table-column>
        
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openDialog(row)">编辑</el-button>
            <el-popconfirm title="确定要删除这道题及所有变体吗？" @confirm="deleteQuestion(row.id)">
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
        <p>题库为空，请先执行导入脚本或手动添加题目。</p>
      </div>
    </el-card>

    <!-- Drawer -->
    <el-drawer 
      v-model="dialogVisible" 
      :title="isEdit ? '编辑标准问题' : '新增标准问题'"
      size="800px"
      destroy-on-close
      custom-class="qb-drawer"
    >
      <el-form :model="formData" :rules="rules" ref="formRef" label-position="top">
        <el-form-item label="标准问题" prop="title">
          <el-input 
            v-model="formData.title" 
            type="textarea" 
            :rows="2" 
            placeholder="请输入标准问题..." 
            style="font-size: 16px;" 
          />
        </el-form-item>
        
        <div style="display: flex; gap: 12px;">
          <el-form-item label="技术领域" prop="domain" style="flex: 1;">
            <el-input v-model="formData.domain" placeholder="例如: Java基础" />
          </el-form-item>
          <el-form-item label="分类标签" prop="categoryTags" style="flex: 1;">
            <el-input v-model="formData.categoryTags" placeholder="例如: Java/面向对象" />
          </el-form-item>
        </div>

        <el-form-item label="核心考点" prop="corePoints">
          <el-input 
            v-model="formData.corePoints" 
            placeholder="例如: 接口 vs 抽象类、单继承多实现" 
          />
        </el-form-item>
        
        <el-form-item label="标准答案要点">
          <el-input 
            v-model="formData.answerKey" 
            type="textarea" 
            :rows="4"
            placeholder="在此输入标准答案的答题要点..." 
          />
        </el-form-item>

        <el-form-item>
          <template #label>
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <span>🤖 AI 个性化解答 (结合简历)</span>
              <el-button size="small" color="#f5a623" style="color: white; border: none;" @click="aiAnswer">
                生成解答
              </el-button>
            </div>
          </template>
          <el-input 
            v-model="formData.aiAnswer" 
            type="textarea" 
            :rows="6"
            placeholder="点击右上角按钮生成 AI 个性化解答..." 
          />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <span class="dialog-footer" style="display: flex; justify-content: flex-end; gap: 12px;">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveQuestion" :loading="saving">保存</el-button>
        </span>
      </template>
    </el-drawer>
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
const searchDomain = ref('')

const dialogVisible = ref(false)
const saving = ref(false)
const isEdit = ref(false)
const formRef = ref(null)

const formData = ref({
  id: '',
  title: '',
  domain: '',
  categoryTags: '',
  corePoints: '',
  answerKey: ''
})

const rules = {
  title: [{ required: true, message: '请输入标准问题', trigger: 'blur' }]
}

const fetchQuestions = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: page.value,
      pageSize: pageSize.value,
      keyword: searchQuery.value,
      domain: searchDomain.value
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

const aiAnswer = async () => {
  if (!formData.value.title) {
    ElMessage.warning('请先输入标准问题')
    return
  }

  const loadingMsg = ElMessage({
    message: '正在思考并结合简历生成答案，请稍候...',
    type: 'info',
    duration: 0
  })

  try {
    const res = await $fetch('/api/questions/ai-answer', {
      method: 'POST',
      body: {
        title: formData.value.title,
        corePoints: formData.value.corePoints
      }
    })

    if (res && res.success) {
      formData.value.aiAnswer = res.data
      ElMessage.success('答案生成成功！')
    } else {
      ElMessage.error(res?.error || 'AI 回答生成失败')
    }
  } catch (error) {
    console.error('AI generate failed:', error)
    ElMessage.error('AI 服务调用异常')
  } finally {
    loadingMsg.close()
  }
}

const openDialog = (row = null) => {
  if (row) {
    isEdit.value = true
    formData.value = {
      id: row.id,
      title: row.title,
      domain: row.domain || '',
      categoryTags: row.categoryTags || '',
      corePoints: row.corePoints || '',
      answerKey: row.answerKey || '',
      aiAnswer: row.aiAnswer || ''
    }
  } else {
    isEdit.value = false
    formData.value = {
      id: '',
      title: '',
      domain: '',
      categoryTags: '',
      corePoints: '',
      answerKey: '',
      aiAnswer: ''
    }
  }
  dialogVisible.value = true
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
            title: formData.value.title,
            domain: formData.value.domain,
            categoryTags: formData.value.categoryTags,
            corePoints: formData.value.corePoints,
            answerKey: formData.value.answerKey,
            aiAnswer: formData.value.aiAnswer
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

const deleteQuestion = async (id) => {
  try {
    const res = await $fetch(`/api/questions/${id}`, {
      method: 'DELETE'
    })
    
    if (res && res.success) {
      ElMessage.success('删除成功')
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
.expand-content {
  padding: 16px 24px;
  background-color: #f8f9fa;
  border-radius: 8px;
  margin: 8px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.expand-content h4 {
  margin: 0 0 8px 0;
  color: #333;
}
.answer-box {
  background: white;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid #e4e7ed;
  font-size: 14px;
  color: #444;
  line-height: 1.6;
}
.variants-section {
  background: white;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid #e4e7ed;
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
