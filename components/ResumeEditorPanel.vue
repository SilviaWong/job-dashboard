<template>
  <main class="editor-main" v-if="profile">
    <!-- 元数据区 -->
    <div class="meta-card">
      <div class="meta-row">
        <div class="input-item flex-2">
          <label class="item-label">简历画像名称 / 定位侧重</label>
          <el-input v-model="form.title" placeholder="如：Java后端架构师 (高并发微服务方向)" maxlength="50" show-word-limit />
        </div>

        <div class="input-item flex-1">
          <label class="item-label">目标求职岗位</label>
          <el-input v-model="form.targetRole" placeholder="如：Java开发专家" maxlength="25" />
        </div>

        <div class="default-switch-box">
          <el-checkbox v-model="form.isDefault" :disabled="profile.isDefault">
            设为主简历 (默认)
          </el-checkbox>
        </div>
      </div>

      <!-- 标签行 -->
      <div class="tags-row">
        <label class="item-label">技能标签与核心亮点</label>
        <div class="tags-container">
          <el-tag
            v-for="(tag, idx) in form.tags"
            :key="tag"
            closable
            size="small"
            @close="removeTag(idx)"
          >
            {{ tag }}
          </el-tag>
          
          <el-input
            v-if="inputTagVisible"
            ref="inputTagRef"
            v-model="inputTagValue"
            size="small"
            style="width: 100px;"
            @keyup.enter="handleTagInputConfirm"
            @blur="handleTagInputConfirm"
          />
          <el-button v-else size="small" class="btn-add-tag" @click="showTagInput">+ 标签</el-button>
        </div>
      </div>
    </div>

    <!-- 编辑区 -->
    <div class="editor-card">
      <div class="editor-header">
        <div class="editor-header-left">
          <el-radio-group v-model="viewMode" size="small">
            <el-radio-button value="edit">✍️ 编辑正文</el-radio-button>
            <el-radio-button value="preview">👁️ 预览排版</el-radio-button>
          </el-radio-group>
          <span class="char-stat">共 {{ form.content.length }} 字符</span>
        </div>

        <div class="editor-header-right">
          <el-button size="small" @click="$emit('duplicate', profile)" :disabled="saving">
            📋 复制为新版本
          </el-button>
          <el-button
            v-if="!profile.isDefault && totalCount > 1"
            size="small"
            type="danger"
            plain
            @click="$emit('delete', profile)"
            :disabled="saving"
          >
            🗑️ 删除版本
          </el-button>
        </div>
      </div>

      <div class="editor-content-box">
        <textarea
          v-if="viewMode === 'edit'"
          class="resume-textarea"
          v-model="form.content"
          placeholder="在此粘贴或编辑该版本的简历内容...&#10;&#10;建议包含：个人简介、专业技能清单、工作经历、核心项目经验 (突出架构难点与成果指标)、教育背景等。"
        ></textarea>
        
        <div v-else class="resume-preview">
          <pre class="preview-pre">{{ form.content }}</pre>
        </div>
      </div>
    </div>

    <!-- 底部保存 -->
    <div class="footer-bar">
      <span class="footer-tip">💡 该简历内容将直接提供给 AI 用于职位匹配打分、JD差距分析与个性化沟通语生成。</span>
      <div class="footer-btns">
        <el-button @click="resetForm" :disabled="saving">重置更改</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="saving">
          保存简历画像
        </el-button>
      </div>
    </div>
  </main>

  <div v-else class="empty-state">
    <p>暂无选中的简历，请在左侧创建或选择简历版本</p>
  </div>
</template>

<script setup>
import { ref, reactive, watch, nextTick } from 'vue'

const props = defineProps({
  profile: {
    type: Object,
    default: null
  },
  totalCount: {
    type: Number,
    default: 1
  },
  saving: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['save', 'duplicate', 'delete'])

const viewMode = ref('edit')
const inputTagVisible = ref(false)
const inputTagValue = ref('')
const inputTagRef = ref(null)

const form = reactive({
  id: '',
  title: '',
  targetRole: '',
  tags: [],
  content: '',
  isDefault: false
})

const syncProfileToForm = () => {
  if (props.profile) {
    form.id = props.profile.id
    form.title = props.profile.title || ''
    form.targetRole = props.profile.targetRole || ''
    form.tags = Array.isArray(props.profile.tags) ? [...props.profile.tags] : []
    form.content = props.profile.content || ''
    form.isDefault = Boolean(props.profile.isDefault)
  }
}

watch(() => props.profile, syncProfileToForm, { immediate: true })

const resetForm = () => {
  syncProfileToForm()
}

const showTagInput = () => {
  inputTagVisible.value = true
  nextTick(() => {
    inputTagRef.value?.focus()
  })
}

const handleTagInputConfirm = () => {
  const val = inputTagValue.value.trim()
  if (val && !form.tags.includes(val)) {
    form.tags.push(val)
  }
  inputTagVisible.value = false
  inputTagValue.value = ''
}

const removeTag = (index) => {
  form.tags.splice(index, 1)
}

const handleSubmit = () => {
  emit('save', { ...form })
}
</script>

<style scoped>
.editor-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.meta-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px 20px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.03);
  border: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.meta-row {
  display: flex;
  gap: 16px;
  align-items: flex-end;
}

.input-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.flex-1 { flex: 1; }
.flex-2 { flex: 2; }

.item-label {
  font-size: 12px;
  font-weight: 500;
  color: #475569;
}

.default-switch-box {
  padding-bottom: 4px;
}

.tags-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tags-container {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.editor-card {
  flex: 1;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.03);
  border: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.editor-header {
  padding: 10px 16px;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.editor-header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.char-stat {
  font-size: 12px;
  color: #94a3b8;
}

.editor-content-box {
  flex: 1;
  min-height: 0;
  padding: 16px;
  box-sizing: border-box;
}

.resume-textarea {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 14px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #fafafa;
  font-size: 14px;
  color: #1e293b;
  line-height: 1.6;
  resize: none;
  outline: none;
  font-family: inherit;
  transition: all 0.2s;
}

.resume-textarea:focus {
  background: #ffffff;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.resume-preview {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 14px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #fafafa;
  overflow-y: auto;
}

.preview-pre {
  margin: 0;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  color: #334155;
}

.footer-bar {
  background: #fff;
  border-radius: 12px;
  padding: 12px 20px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.03);
  border: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.footer-tip {
  font-size: 12px;
  color: #64748b;
}

.footer-btns {
  display: flex;
  gap: 12px;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border-radius: 12px;
  color: #94a3b8;
  font-size: 14px;
}
</style>

