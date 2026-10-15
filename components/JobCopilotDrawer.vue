<template>
  <el-drawer
    v-model="visible"
    title="求职智能管家 (Job Copilot)"
    size="480px"
    :with-header="false"
    destroy-on-close
    class="copilot-drawer"
  >
    <div class="copilot-container">
      <!-- 顶部 Header -->
      <div class="copilot-header">
        <div class="copilot-brand">
          <div class="brand-avatar">
            <Bot :size="20" class="bot-icon" />
            <span class="status-indicator"></span>
          </div>
          <div class="brand-info">
            <div class="brand-title">
              <span>Job Copilot</span>
              <el-tag size="small" type="success" effect="plain" class="agent-tag">智能体已就绪</el-tag>
            </div>
            <div class="brand-subtitle">你的 7x24h 本地全流程求职教练</div>
          </div>
        </div>
        <div class="header-actions">
          <el-tooltip content="清空对话记忆" placement="bottom">
            <el-button link circle @click="clearHistory">
              <Trash2 :size="16" />
            </el-button>
          </el-tooltip>
          <el-button link circle @click="visible = false">
            <span style="font-size: 18px;">&times;</span>
          </el-button>
        </div>
      </div>

      <!-- 消息会话区域 -->
      <div class="messages-scroll" ref="messagesContainer">
        <!-- 欢迎卡片 & 快捷指令 -->
        <div v-if="messages.length === 0" class="welcome-section">
          <div class="welcome-card">
            <div class="welcome-header">
              <Sparkles :size="24" class="sparkle-icon" />
              <h3>你好！我是你的求职管家</h3>
            </div>
            <p class="welcome-desc">
              我已连接本地职位库、简历画像与题库。你可以吩咐我检索高匹配职位、一键初筛过滤僵尸岗、针对目标岗位定制招呼语，或分析求职漏斗。
            </p>

            <div class="quick-prompts-title">💡 快捷启动任务</div>
            <div class="quick-prompts-grid">
              <div
                v-for="(qp, idx) in quickPrompts"
                :key="idx"
                class="quick-prompt-item"
                @click="sendQuickPrompt(qp.prompt)"
              >
                <div class="qp-icon">{{ qp.icon }}</div>
                <div class="qp-content">
                  <div class="qp-title">{{ qp.title }}</div>
                  <div class="qp-desc">{{ qp.desc }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 历史消息列表 -->
        <div v-for="(msg, index) in messages" :key="index" :class="['message-row', msg.role]">
          <!-- 消息头像 -->
          <div class="msg-avatar">
            <Bot v-if="msg.role === 'assistant'" :size="16" />
            <span v-else>我</span>
          </div>

          <!-- 消息气泡 -->
          <div class="msg-body">
            <!-- Agent 思考与工具调用链 (可折叠展示) -->
            <div v-if="msg.steps && msg.steps.length > 0" class="steps-container">
              <div class="steps-toggle" @click="msg.showSteps = !msg.showSteps">
                <span class="steps-label">
                  <Sparkles :size="13" />
                  已执行 {{ msg.steps.length }} 个思考与数据调用步骤
                </span>
                <component :is="msg.showSteps ? ChevronDown : ChevronRight" :size="14" />
              </div>

              <div v-if="msg.showSteps" class="steps-list">
                <div v-for="(st, sIdx) in msg.steps" :key="sIdx" class="step-item">
                  <div class="step-header">
                    <span class="step-badge">步骤 {{ st.step }}</span>
                    <span v-if="st.toolName" class="tool-tag">调用工具: {{ st.toolName }}</span>
                  </div>
                  <div class="step-thought">{{ st.thought }}</div>
                  <div v-if="st.toolParams" class="step-data-preview">
                    <span class="data-label">入参:</span>
                    <code>{{ JSON.stringify(st.toolParams) }}</code>
                  </div>
                </div>
              </div>
            </div>

            <!-- 文本正文 -->
            <div class="msg-text" v-html="formatMessageContent(msg.content)"></div>

            <!-- 结构化卡片呈现 -->
            <div v-if="msg.cards && msg.cards.length > 0" class="msg-cards">
              <div v-for="(card, cIdx) in msg.cards" :key="cIdx" class="agent-card">
                <div class="card-title">{{ card.title }}</div>

                <!-- 职位列表卡片 -->
                <div v-if="card.type === 'job_list' || card.type === 'batch_scan_result'" class="card-job-list">
                  <div
                    v-for="job in (card.data.jobs || card.data)"
                    :key="job.jobId"
                    class="card-job-item"
                  >
                    <div class="job-item-top">
                      <span class="job-title" @click="handleOpenJob(job.jobId)">{{ job.title }}</span>
                      <span class="job-salary">{{ job.salary }}</span>
                    </div>
                    <div class="job-item-sub">
                      <span>{{ job.companyName }}</span>
                      <span>·</span>
                      <span>{{ job.location || job.city }}</span>
                      <el-tag
                        v-if="job.score !== null && job.score !== undefined"
                        size="small"
                        :type="job.score >= 80 ? 'success' : job.score >= 60 ? 'warning' : 'info'"
                        class="score-badge"
                      >
                        {{ job.score }}分
                      </el-tag>
                    </div>
                    <div class="job-item-actions">
                      <el-button size="small" link type="primary" @click="handleOpenJob(job.jobId)">
                        查看详情
                      </el-button>
                      <el-button
                        size="small"
                        link
                        type="success"
                        @click="handleQuickStatus(job.jobId, 'to-apply')"
                      >
                        设为待投递
                      </el-button>
                      <el-button
                        size="small"
                        link
                        @click="sendQuickPrompt(`帮我为 ${job.companyName} 的「${job.title}」生成一段 Boss 直聘打招呼文案`)"
                      >
                        写招呼语
                      </el-button>
                    </div>
                  </div>
                </div>

                <!-- 打招呼语卡片 -->
                <div v-else-if="card.type === 'greeting'" class="card-greeting">
                  <div class="greeting-content">{{ card.data.greeting }}</div>
                  <div class="greeting-actions">
                    <el-button size="small" type="primary" @click="copyText(card.data.greeting)">
                      <Copy :size="13" style="margin-right: 4px;" /> 一键复制招呼语
                    </el-button>
                    <el-button
                      v-if="card.data.jobId"
                      size="small"
                      @click="handleQuickStatus(card.data.jobId, 'applied')"
                    >
                      标记为已投递
                    </el-button>
                  </div>
                </div>

                <!-- 漏斗分析卡片 -->
                <div v-else-if="card.type === 'funnel_summary'" class="card-funnel">
                  <div class="funnel-stats-grid">
                    <div class="f-stat-item">
                      <div class="f-num">{{ card.data.totalJobs }}</div>
                      <div class="f-label">职位总库</div>
                    </div>
                    <div class="f-stat-item">
                      <div class="f-num">{{ card.data.diagnosedRatio }}</div>
                      <div class="f-label">AI诊断率</div>
                    </div>
                    <div class="f-stat-item">
                      <div class="f-num">{{ card.data.activeInterviews }}</div>
                      <div class="f-label">面试跟进</div>
                    </div>
                  </div>
                  <div class="funnel-stages-list">
                    <div v-for="(val, stageName) in card.data.stages" :key="stageName" class="stage-row">
                      <span class="stage-name">{{ stageName }}</span>
                      <span class="stage-val">{{ val }} 个</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 正在加载思考中状态 -->
        <div v-if="loading" class="message-row assistant loading-row">
          <div class="msg-avatar">
            <Bot :size="16" />
          </div>
          <div class="msg-body loading-bubble">
            <div class="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span class="loading-hint">智能体正在调度本地数据与推理思考...</span>
          </div>
        </div>
      </div>

      <!-- 底部输入区域 -->
      <div class="copilot-footer">
        <el-input
          v-model="inputQuery"
          type="textarea"
          :rows="2"
          placeholder="问我任何关于岗位、简历改写、面试准备的问题... (Enter 发送)"
          resize="none"
          class="chat-input"
          @keydown.enter.exact.prevent="handleSend"
        />
        <div class="footer-bar">
          <div class="footer-tip">按 Enter 发送，Shift + Enter 换行</div>
          <el-button
            type="primary"
            :loading="loading"
            :disabled="!inputQuery.trim()"
            class="send-btn"
            @click="handleSend"
          >
            <Send :size="14" />
            <span>发送</span>
          </el-button>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Bot,
  Sparkles,
  Trash2,
  Send,
  Copy,
  ChevronDown,
  ChevronRight
} from 'lucide-vue-next'

const emit = defineEmits(['open-job'])

const visible = ref(false)
const loading = ref(false)
const inputQuery = ref('')
const messages = ref([])
const messagesContainer = ref(null)

const quickPrompts = [
  {
    icon: '⚡',
    title: '一键智能巡检',
    desc: '自动扫描未处理岗位，过滤外包/僵尸岗并推荐高分职位',
    prompt: '请启动一次本地职位的智能巡检，过滤掉黑名单和僵尸岗，推荐当前最匹配的前 5 个职位。'
  },
  {
    icon: '🎯',
    title: '优质投递推荐',
    desc: '按高匹配度与薪资综合推荐待投递岗位',
    prompt: '根据我的默认简历，从本地职位库中检索匹配度最高、最值得立刻投递的 5 个岗位。'
  },
  {
    icon: '📊',
    title: '求职漏斗诊断',
    desc: '分析当前各阶段投递进展与推进瓶颈',
    prompt: '帮我查看当前的求职漏斗统计数据，并给出针对接下来的求职推进策略建议。'
  },
  {
    icon: '💡',
    title: '查看简历画像',
    desc: '盘点当前系统中维护的各方向简历版本',
    prompt: '查看我目前在系统中保存了哪些简历画像，各自主攻什么方向？'
  }
]

const scrollToBottom = async () => {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

const sendQuickPrompt = (promptText) => {
  inputQuery.value = promptText
  handleSend()
}

const handleSend = async () => {
  const query = inputQuery.value.trim()
  if (!query || loading.value) return

  messages.value.push({
    role: 'user',
    content: query
  })
  inputQuery.value = ''
  loading.value = true
  scrollToBottom()

  try {
    const history = messages.value.slice(-6).map(m => ({
      role: m.role,
      content: m.content
    }))

    const res = await $fetch('/api/agent/chat', {
      method: 'POST',
      body: {
        message: query,
        history
      }
    })

    if (res && res.success) {
      messages.value.push({
        role: 'assistant',
        content: res.answer,
        steps: res.steps || [],
        cards: res.cards || [],
        showSteps: false
      })
    } else {
      messages.value.push({
        role: 'assistant',
        content: res?.answer || res?.error || '处理请求时发生错误，请稍后重试。',
        steps: res?.steps || [],
        cards: [],
        showSteps: false
      })
    }
  } catch (err) {
    messages.value.push({
      role: 'assistant',
      content: `请求失败: ${err.message || '网络连接异常'}`,
      steps: [],
      cards: [],
      showSteps: false
    })
  } finally {
    loading.value = false
    scrollToBottom()
  }
}

const clearHistory = () => {
  messages.value = []
  ElMessage.success('已清空会话记录')
}

const formatMessageContent = (content) => {
  if (!content) return ''
  // 简易 Markdown 排版转换 (换行、加粗、列表)
  let text = content
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
  return text
}

const copyText = (text) => {
  if (!text) return
  navigator.clipboard.writeText(text)
  ElMessage.success('打招呼语已复制到剪贴板！')
}

const handleOpenJob = (jobId) => {
  emit('open-job', jobId)
}

const handleQuickStatus = async (jobId, status) => {
  try {
    await $fetch(`/api/jobs/${jobId}`, {
      method: 'PUT',
      body: { status }
    })
    ElMessage.success(`已将职位状态更新为: ${status}`)
  } catch (e) {
    ElMessage.error('更新状态失败')
  }
}

const open = (initialQuery) => {
  visible.value = true
  if (initialQuery) {
    sendQuickPrompt(initialQuery)
  }
}

defineExpose({
  open,
  sendQuickPrompt
})
</script>

<style scoped>
.copilot-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #FBFBFC;
}

/* Header */
.copilot-header {
  padding: 16px 20px;
  background: #FFFFFF;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.copilot-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-avatar {
  position: relative;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: linear-gradient(135deg, #007AFF 0%, #0051C6 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 4px 12px rgba(0, 122, 255, 0.25);
}

.status-indicator {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: #34C759;
  border: 2px solid #fff;
}

.brand-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-color);
}

.agent-tag {
  font-size: 11px;
  border-radius: 6px;
  padding: 0 6px;
  height: 20px;
  line-height: 20px;
}

.brand-subtitle {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 消息流区域 */
.messages-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 欢迎引导卡片 */
.welcome-section {
  display: flex;
  flex-direction: column;
}

.welcome-card {
  background: #FFFFFF;
  border-radius: 16px;
  padding: 20px;
  border: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
}

.welcome-header {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #007AFF;
  margin-bottom: 8px;
}

.welcome-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-color);
}

.welcome-desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
  margin-bottom: 16px;
}

.quick-prompts-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.quick-prompts-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quick-prompt-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: #F8F9FA;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.03);
  cursor: pointer;
  transition: all 0.2s ease;
}

.quick-prompt-item:hover {
  background: #F0F6FF;
  border-color: rgba(0, 122, 255, 0.2);
  transform: translateY(-1px);
}

.qp-icon {
  font-size: 18px;
}

.qp-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.qp-desc {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
}

/* 消息行 */
.message-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.message-row.user {
  flex-direction: row-reverse;
}

.msg-avatar {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.message-row.user .msg-avatar {
  background: #007AFF;
  color: #fff;
}

.message-row.assistant .msg-avatar {
  background: #EAECEF;
  color: #333;
}

.msg-body {
  max-width: 85%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.message-row.user .msg-text {
  background: #007AFF;
  color: #FFFFFF;
  padding: 10px 14px;
  border-radius: 16px 4px 16px 16px;
  font-size: 13px;
  line-height: 1.5;
  box-shadow: 0 2px 8px rgba(0, 122, 255, 0.15);
}

.message-row.assistant .msg-text {
  background: #FFFFFF;
  color: var(--text-color);
  padding: 14px 16px;
  border-radius: 4px 16px 16px 16px;
  font-size: 13px;
  line-height: 1.6;
  border: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.03);
}

/* 思考步骤折叠 */
.steps-container {
  background: #F4F6F8;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.04);
  font-size: 12px;
  overflow: hidden;
}

.steps-toggle {
  padding: 8px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  color: var(--text-secondary);
  font-weight: 500;
  user-select: none;
}

.steps-label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.steps-list {
  padding: 0 12px 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px dashed rgba(0, 0, 0, 0.06);
}

.step-item {
  padding-top: 8px;
}

.step-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.step-badge {
  font-weight: 600;
  font-size: 11px;
  color: #007AFF;
}

.tool-tag {
  font-size: 10px;
  background: #E6F0FF;
  color: #007AFF;
  padding: 1px 6px;
  border-radius: 4px;
}

.step-thought {
  color: var(--text-color);
  font-size: 11px;
  line-height: 1.4;
}

.step-data-preview {
  margin-top: 4px;
  font-size: 10px;
  color: #888;
  word-break: break-all;
}

/* 结构化卡片样式 */
.agent-card {
  background: #FFFFFF;
  border-radius: 12px;
  padding: 14px;
  border: 1px solid rgba(0, 122, 255, 0.12);
  box-shadow: 0 4px 16px rgba(0, 122, 255, 0.04);
}

.card-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-color);
  margin-bottom: 10px;
  display: flex;
  align-items: center;
}

/* 职位列表卡片 */
.card-job-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card-job-item {
  padding: 10px;
  background: #F9FAFB;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.03);
}

.job-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.job-title {
  font-size: 13px;
  font-weight: 600;
  color: #007AFF;
  cursor: pointer;
}

.job-title:hover {
  text-decoration: underline;
}

.job-salary {
  font-size: 12px;
  font-weight: 700;
  color: #FF9500;
}

.job-item-sub {
  font-size: 11px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.score-badge {
  font-size: 10px;
  height: 18px;
  padding: 0 4px;
}

.job-item-actions {
  display: flex;
  gap: 4px;
  border-top: 1px dashed rgba(0, 0, 0, 0.05);
  padding-top: 6px;
}

/* 招呼语卡片 */
.card-greeting {
  background: #F0F7FF;
  border-radius: 8px;
  padding: 12px;
}

.greeting-content {
  font-size: 12px;
  line-height: 1.6;
  color: #1A365D;
  margin-bottom: 10px;
  white-space: pre-wrap;
}

.greeting-actions {
  display: flex;
  gap: 8px;
}

/* 漏斗分析卡片 */
.funnel-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}

.f-stat-item {
  background: #F9FAFB;
  border-radius: 8px;
  padding: 8px;
  text-align: center;
}

.f-num {
  font-size: 16px;
  font-weight: 700;
  color: #007AFF;
}

.f-label {
  font-size: 10px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.funnel-stages-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stage-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-color);
  padding: 4px 6px;
  background: #F8F9FA;
  border-radius: 4px;
}

/* Loading 气泡 */
.loading-bubble {
  background: #FFFFFF;
  padding: 12px 16px;
  border-radius: 4px 16px 16px 16px;
  border: 1px solid rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  gap: 12px;
}

.typing-indicator {
  display: flex;
  gap: 4px;
}

.typing-indicator span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #007AFF;
  animation: typing 1.4s infinite ease-in-out;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing {
  0%, 80%, 100% {
    transform: scale(0.6);
    opacity: 0.4;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

.loading-hint {
  font-size: 12px;
  color: var(--text-secondary);
}

/* Footer 输入区域 */
.copilot-footer {
  padding: 14px 20px 20px 20px;
  background: #FFFFFF;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.chat-input :deep(.el-textarea__inner) {
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  padding: 10px 12px;
  font-size: 13px;
  background: #F9FAFB;
}

.chat-input :deep(.el-textarea__inner:focus) {
  background: #FFFFFF;
  border-color: #007AFF;
}

.footer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
}

.footer-tip {
  font-size: 11px;
  color: #A0A0A5;
}

.send-btn {
  border-radius: 8px;
  gap: 6px;
  padding: 8px 16px;
}
</style>
