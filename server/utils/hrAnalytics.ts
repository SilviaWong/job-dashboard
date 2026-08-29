/**
 * HR 活跃度分析与僵尸岗位识别引擎
 * 跨招聘平台（Boss直聘、猎聘、51job、智联招聘）标准化 HR 活跃状态及评级
 */

export type HrActiveLevel = 'active' | 'moderate' | 'zombie' | 'unknown'

export interface HrActiveResult {
  hrActiveStatus: string
  hrActiveLevel: HrActiveLevel
}

function safeJsonParse(str: any) {
  if (typeof str !== 'string') return str
  try {
    return JSON.parse(str)
  } catch (e) {
    return null
  }
}

/**
 * 从不同招聘平台的原始数据和详情中提取 HR 活跃度文本
 */
export function extractRawHrStatus(raw: any, jobDetail?: any, platform?: string): string {
  if (!raw && !jobDetail) return ''

  const p = platform || raw?.platform || ''

  // 1. Boss直聘
  if (p.includes('Boss') || p.includes('boss')) {
    const detailData = jobDetail?.rawData ? safeJsonParse(jobDetail.rawData) : jobDetail
    if (detailData?.['HR活跃度'] && typeof detailData['HR活跃度'] === 'string' && detailData['HR活跃度'].trim()) {
      return detailData['HR活跃度'].trim()
    }
    const zpBoss = raw?.jobDetail?.zpData?.bossInfo
    if (zpBoss?.activeTimeDesc) return String(zpBoss.activeTimeDesc).trim()
    if (raw?.activeTimeDesc) return String(raw.activeTimeDesc).trim()
    if (raw?.bossActive) return String(raw.bossActive).trim()
    if (raw?.bossOnline === true) return '当前在线'
  }

  // 2. 猎聘
  if (p.includes('猎聘') || p.includes('liepin')) {
    const recruiter = raw?.recruiter
    if (recruiter?.imShowText) return String(recruiter.imShowText).trim()
    if (recruiter?.inDay) return '今日在线'
    if (recruiter?.imStatus) return '当前在线'
  }

  // 3. 51job
  if (p.includes('51job') || p.includes('51')) {
    if (Array.isArray(raw?.hrLabels) && raw.hrLabels.length > 0) {
      return raw.hrLabels.map((l: any) => String(l).trim()).filter(Boolean).join(' · ')
    }
    if (raw?.hrIsOnline === true) return '当前在线'
    if (raw?.applyTimeText) return String(raw.applyTimeText).trim()
  }

  // 4. 智联
  if (p.includes('智联') || p.includes('zhilian')) {
    const staff = raw?.staffCard
    if (staff?.hrOnlineState && String(staff.hrOnlineState).trim()) {
      return String(staff.hrOnlineState).trim()
    }
    if (staff?.hrStateInfo && String(staff.hrStateInfo).trim()) {
      return String(staff.hrStateInfo).trim()
    }
    if (raw?.workActiveText) return String(raw.workActiveText).trim()
    if (raw?.chatLabel) return String(raw.chatLabel).trim()
  }

  // 5. 通用兜底查找
  if (raw?.hrActiveStatus) return String(raw.hrActiveStatus).trim()
  if (raw?.['HR活跃度']) return String(raw['HR活跃度']).trim()
  if (raw?.hrStatus) return String(raw.hrStatus).trim()

  return ''
}

/**
 * 根据 HR 活跃度描述判断活跃等级
 */
export function classifyHrActiveLevel(statusText: string): HrActiveLevel {
  if (!statusText || !statusText.trim()) {
    return 'unknown'
  }
  const s = statusText.trim()

  // 1. 绝对日期检测 (如 2026-08-19, 2026/08/19)
  const dateMatch = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/)
  if (dateMatch) {
    const targetDate = new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]))
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays <= 7) return 'active'
    if (diffDays <= 30) return 'moderate'
    return 'zombie'
  }

  // 2. 僵尸岗位指标 (数月、年、很久、离职、未活跃)
  if (/年|很久|未活跃|离职|下线|半年|[2-9]个月|1[0-2]个月/.test(s)) {
    return 'zombie'
  }

  // 3. 高频活跃指标 (在线、今日、刚刚、昨日、小时、分钟、3日、7天、本周、搜人才、处理、回复)
  if (/在线|刚刚|今日|今天|昨日|昨天|小时|分钟|秒|3日|3天|7日|7天|本周|处理|回复|搜人才|投递/.test(s)) {
    return 'active'
  }

  // 4. 一般活跃指标 (2周、3周、半月、本月、1个月)
  if (/2周|3周|半月|本月|1个月|[1-3]\d天/.test(s)) {
    return 'moderate'
  }

  return 'moderate'
}

/**
 * 解析并标准化职位的 HR 活跃度
 */
export function resolveJobHrActive(raw: any, jobDetail?: any, platform?: string): HrActiveResult {
  const status = extractRawHrStatus(raw, jobDetail, platform)
  const level = classifyHrActiveLevel(status)
  return {
    hrActiveStatus: status,
    hrActiveLevel: level
  }
}
