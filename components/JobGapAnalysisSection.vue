<template>
  <div class="gap-analysis-card">
    <div class="gap-header">
      <div class="header-left">
        <h4 class="gap-title">🔍 JD 深度技能差距对齐 (Gap Analysis)</h4>
        <span class="gap-subtitle">多维比对所选简历画像与 JD，定位胜任亮点与短板盲区</span>
      </div>
      <el-button
        size="small"
        type="primary"
        plain
        :loading="loading"
        @click="$emit('analyze')"
      >
        {{ gapData ? '🔄 重新对齐分析' : '🚀 开始差距分析' }}
      </el-button>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="gap-loading">
      <el-skeleton :rows="4" animated />
    </div>

    <!-- 结果展示 -->
    <div v-else-if="gapData" class="gap-result">
      <!-- 评分概览 -->
      <div class="score-summary-bar">
        <div class="score-badge-box">
          <span class="score-num">{{ gapData.matchScore || 0 }}</span>
          <span class="score-label">分</span>
          <el-tag
            :type="getLevelTagType(gapData.matchLevel)"
            effect="dark"
            size="small"
            class="level-tag"
          >
            {{ gapData.matchLevel || 'B' }} 级匹配
          </el-tag>
        </div>
        <div class="summary-text-box">
          <p class="summary-text">{{ gapData.summary }}</p>
        </div>
      </div>

      <!-- 四象限分析 -->
      <div class="quadrant-grid">
        <!-- 核心契合亮点 -->
        <div class="quadrant-box matched-box">
          <div class="box-title">
            <span class="dot green"></span>
            <h5>🟢 核心胜任优势与契合点</h5>
          </div>
          <ul class="item-list">
            <li v-for="(item, idx) in gapData.matchedSkills" :key="idx" class="skill-item">
              <span class="skill-name">{{ item.skill }}</span>
              <span class="skill-detail">{{ item.detail }}</span>
            </li>
            <li v-if="!gapData.matchedSkills?.length" class="empty-tip">未检出显著优势项</li>
          </ul>
        </div>

        <!-- 技能短板与差距 -->
        <div class="quadrant-box missing-box">
          <div class="box-title">
            <span class="dot red"></span>
            <h5>🔴 技能短板与缺失项 (Gap)</h5>
          </div>
          <ul class="item-list">
            <li v-for="(item, idx) in gapData.missingSkills" :key="idx" class="skill-item">
              <div class="skill-title-row">
                <span class="skill-name">{{ item.skill }}</span>
                <el-tag size="small" :type="item.impact === '高' ? 'danger' : 'warning'" effect="plain">
                  影响: {{ item.impact || '中' }}
                </el-tag>
              </div>
              <span class="skill-detail">{{ item.detail }}</span>
            </li>
            <li v-if="!gapData.missingSkills?.length" class="empty-tip">技能要求完全覆盖，暂无明显短板</li>
          </ul>
        </div>

        <!-- 面试官挑刺风险预警 -->
        <div class="quadrant-box risk-box">
          <div class="box-title">
            <span class="dot amber"></span>
            <h5>⚠️ 面试挑刺风险点预警</h5>
          </div>
          <ul class="item-list text-only">
            <li v-for="(risk, idx) in gapData.interviewRisks" :key="idx" class="text-item">
              {{ risk }}
            </li>
            <li v-if="!gapData.interviewRisks?.length" class="empty-tip">暂无显著风险点</li>
          </ul>
        </div>

        <!-- 简历定制优化建议 -->
        <div class="quadrant-box advice-box">
          <div class="box-title">
            <span class="dot blue"></span>
            <h5>💡 针对该 JD 的简历微调建议</h5>
          </div>
          <ul class="item-list text-only">
            <li v-for="(adv, idx) in gapData.tailoredAdvice" :key="idx" class="text-item">
              {{ adv }}
            </li>
            <li v-if="!gapData.tailoredAdvice?.length" class="empty-tip">保持当前简历即可</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="gap-empty">
      <p class="empty-desc">尚未对此岗位进行技能差距对齐。点击上方按钮，AI 将逐条比对所选简历与岗位要求，挖掘核心优势与潜在风险。</p>
    </div>
  </div>
</template>

<script setup>
defineProps({
  gapData: {
    type: Object,
    default: null
  },
  loading: {
    type: Boolean,
    default: false
  }
})

defineEmits(['analyze'])

const getLevelTagType = (level) => {
  switch (level) {
    case 'A': return 'success'
    case 'B': return 'primary'
    case 'C': return 'warning'
    case 'D': return 'danger'
    default: return 'info'
  }
}
</script>

<style scoped>
.gap-analysis-card {
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  padding: 18px 20px;
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.gap-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.gap-title {
  margin: 0 0 4px 0;
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
}

.gap-subtitle {
  font-size: 12px;
  color: #94a3b8;
}

.score-summary-bar {
  display: flex;
  gap: 16px;
  align-items: center;
  background: #f8fafc;
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid #edf2f7;
}

.score-badge-box {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.score-num {
  font-size: 26px;
  font-weight: 700;
  color: #0284c7;
}

.score-label {
  font-size: 13px;
  color: #64748b;
  margin-right: 6px;
}

.summary-text-box {
  flex: 1;
}

.summary-text {
  margin: 0;
  font-size: 13px;
  color: #334155;
  line-height: 1.5;
}

.quadrant-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.quadrant-box {
  background: #fafafa;
  border-radius: 8px;
  padding: 12px 14px;
  border: 1px solid #f1f5f9;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.box-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.box-title h5 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.dot.green { background: #16a34a; }
.dot.red { background: #dc2626; }
.dot.amber { background: #d97706; }
.dot.blue { background: #2563eb; }

.item-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skill-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: #ffffff;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #f1f5f9;
}

.skill-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.skill-name {
  font-size: 12px;
  font-weight: 600;
  color: #1e293b;
}

.skill-detail {
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}

.text-only .text-item {
  font-size: 12px;
  color: #475569;
  line-height: 1.5;
  position: relative;
  padding-left: 12px;
}

.text-only .text-item::before {
  content: "•";
  position: absolute;
  left: 0;
  color: #94a3b8;
}

.empty-tip {
  font-size: 12px;
  color: #94a3b8;
  font-style: italic;
  padding: 6px 0;
}

.gap-empty {
  padding: 16px;
  text-align: center;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px dashed #e2e8f0;
}

.empty-desc {
  margin: 0;
  font-size: 13px;
  color: #64748b;
}

@media (max-width: 900px) {
  .quadrant-grid {
    grid-template-columns: 1fr;
  }
}
</style>

