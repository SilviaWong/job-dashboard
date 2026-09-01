/**
 * 职位时效与生命周期多维度分析工具
 */

export function parseDateString(str: any): Date | null {
  if (!str) return null
  if (str instanceof Date) return isNaN(str.getTime()) ? null : str

  const s = String(str).trim()
  if (!s) return null

  // 处理带有类似 "2025-09-17 10:12:21" 格式
  let cleanStr = s
  if (cleanStr.includes(' ')) {
    cleanStr = cleanStr.replace(' ', 'T')
  }

  const d = new Date(cleanStr)
  if (!isNaN(d.getTime())) {
    return d
  }

  // 尝试匹配 YYYY-MM-DD
  const m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) {
    const year = parseInt(m[1], 10)
    const month = parseInt(m[2], 10) - 1
    const day = parseInt(m[3], 10)
    const parsed = new Date(year, month, day)
    if (!isNaN(parsed.getTime())) return parsed
  }

  return null
}

export function formatDisplayDate(dateInput: any): string {
  if (!dateInput) return ''
  const d = parseDateString(dateInput)
  if (!d) return String(dateInput).slice(0, 10)
  
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatTimeAgo(dateInput: any): string {
  if (!dateInput) return ''
  const d = parseDateString(dateInput)
  if (!d) return String(dateInput)

  const diffMs = Date.now() - d.getTime()
  if (diffMs < 0) return '刚刚'

  const diffHours = Math.floor(diffMs / (3600 * 1000))
  if (diffHours < 1) return '刚刚'
  if (diffHours < 24) return `${diffHours}小时前`

  const diffDays = Math.floor(diffMs / (24 * 3600 * 1000))
  if (diffDays <= 1) return '昨天'
  if (diffDays < 30) return `${diffDays}天前`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}个月前`
  return `${Math.floor(diffDays / 365)}年前`
}

export function getJobPublishDate(job: any): Date | null {
  if (!job) return null
  return parseDateString(job.platformPublishTime) ||
         parseDateString(job.normalizedData?.publishDate) ||
         parseDateString(job.firstSeen) ||
         parseDateString(job.createdAt)
}

export function getJobUpdateDate(job: any): Date | null {
  if (!job) return null
  return parseDateString(job.platformUpdateTime) ||
         parseDateString(job.normalizedData?.updateDate) ||
         parseDateString(job.lastSeen) ||
         parseDateString(job.updatedAt)
}

export function getJobAgeDays(job: any): number {
  const pDate = getJobPublishDate(job)
  if (!pDate) return 0
  const diffDays = Math.floor((Date.now() - pDate.getTime()) / (24 * 3600 * 1000))
  return Math.max(0, diffDays)
}

export interface JobTimeDiagnosis {
  type: 'fresh' | 'active' | 'renewed_old' | 'stale' | 'unknown'
  badgeText: string
  badgeColor: string
  badgeBg: string
  badgeType: 'success' | 'warning' | 'danger' | 'info' | 'primary'
  ageDays: number
  refreshDays: number | null
  isNew: boolean
  isStale: boolean
  isRenewedOld: boolean
  summary: string
  advice: string
}

/**
 * 智能时效诊断算法
 */
export function getJobTimeDiagnosis(job: any): JobTimeDiagnosis {
  const pDate = getJobPublishDate(job)
  const uDate = getJobUpdateDate(job)
  const now = Date.now()

  if (!pDate) {
    return {
      type: 'unknown',
      badgeText: '时效未知',
      badgeColor: '#64748b',
      badgeBg: '#f1f5f9',
      badgeType: 'info',
      ageDays: 0,
      refreshDays: null,
      isNew: false,
      isStale: false,
      isRenewedOld: false,
      summary: '暂未获取到有效发布时间',
      advice: '可前往平台原网页核实职位活跃情况。'
    }
  }

  const ageDays = Math.max(0, Math.floor((now - pDate.getTime()) / (24 * 3600 * 1000)))
  const refreshDays = uDate ? Math.max(0, Math.floor((now - uDate.getTime()) / (24 * 3600 * 1000))) : null

  // 1. 7天内真黄金新发
  if (ageDays <= 7) {
    const isToday = ageDays <= 1
    return {
      type: 'fresh',
      badgeText: isToday ? '🔥 今日首发' : `🟢 ${ageDays}天前首发`,
      badgeColor: '#15803d',
      badgeBg: '#dcfce7',
      badgeType: 'success',
      ageDays,
      refreshDays,
      isNew: true,
      isStale: false,
      isRenewedOld: false,
      summary: `新放出职位 (已挂牌 ${ageDays === 0 ? '不足1' : ageDays} 天)`,
      advice: '新开招聘HC，简历竞争少，HR当前筛选意愿最高，建议优先抓紧投递！'
    }
  }

  // 2. 挂牌超60天，但近7天有刷新（老坑翻新 / 轮换替补 / 备胎池）
  if (ageDays > 60 && refreshDays !== null && refreshDays <= 7) {
    return {
      type: 'renewed_old',
      badgeText: `🔄 挂牌${ageDays}天·近期刷新`,
      badgeColor: '#c2410c',
      badgeBg: '#ffedd5',
      badgeType: 'warning',
      ageDays,
      refreshDays,
      isNew: false,
      isStale: true,
      isRenewedOld: true,
      summary: `长期挂牌岗 (在招 ${ageDays} 天，${refreshDays <= 1 ? '近期' : `${refreshDays}天前`}有刷新)`,
      advice: '职位已长期存在，近期有刷新动作。多属于业务常年缺人、备胎简历库或人员流动大的岗位，建议结合自身情况理性投递。'
    }
  }

  // 3. 挂牌超60天且无近期刷新（长期常驻挂机 / 疑似僵尸岗）
  if (ageDays > 60) {
    return {
      type: 'stale',
      badgeText: `⚠️ 挂牌${ageDays}天 (长期)`,
      badgeColor: '#64748b',
      badgeBg: '#f1f5f9',
      badgeType: 'info',
      ageDays,
      refreshDays,
      isNew: false,
      isStale: true,
      isRenewedOld: false,
      summary: `长期挂牌未更新 (在招 ${ageDays} 天)`,
      advice: '该职位挂网已久且长期未见刷新，可能已招满未及时关停或属于系统常驻挂机岗，建议优先看更新鲜的职位。'
    }
  }

  // 4. 8~60天的常规在招职位
  const isRecentRefreshed = refreshDays !== null && refreshDays <= 3
  return {
    type: 'active',
    badgeText: isRecentRefreshed ? `⚡ 挂牌${ageDays}天·${formatTimeAgo(uDate)}刷新` : `挂牌 ${ageDays} 天`,
    badgeColor: '#0284c7',
    badgeBg: '#e0f2fe',
    badgeType: 'primary',
    ageDays,
    refreshDays,
    isNew: false,
    isStale: false,
    isRenewedOld: false,
    summary: `常规在招 (已挂牌 ${ageDays} 天${uDate ? `，${formatTimeAgo(uDate)}刷新` : ''})`,
    advice: '处于正常招聘周期内，岗位持续推进入选，可正常投递。'
  }
}

export interface TimelineItem {
  title: string
  date: string
  relative: string
  desc: string
  tagType?: 'success' | 'warning' | 'info' | 'primary'
}

/**
 * 组装职位的完整生命周期脉络
 */
export function getJobTimeline(job: any): TimelineItem[] {
  const items: TimelineItem[] = []

  // 1. 平台首发
  const pPub = job.platformPublishTime || job.normalizedData?.publishDate
  if (pPub) {
    items.push({
      title: '平台首发',
      date: formatDisplayDate(pPub),
      relative: formatTimeAgo(pPub),
      desc: '源招聘平台官方记录的初始创建/发布时间',
      tagType: 'success'
    })
  }

  // 2. 本地系统首次抓取
  if (job.firstSeen) {
    items.push({
      title: '系统收录',
      date: formatDisplayDate(job.firstSeen),
      relative: formatTimeAgo(job.firstSeen),
      desc: '爬虫系统首次扫描并收录建档时间',
      tagType: 'primary'
    })
  }

  // 3. 平台最后刷新/更新
  const pUpd = job.platformUpdateTime || job.normalizedData?.updateDate
  if (pUpd) {
    items.push({
      title: '平台刷新',
      date: formatDisplayDate(pUpd),
      relative: formatTimeAgo(pUpd),
      desc: '招聘人员在平台后台主动刷新或修改岗位时间',
      tagType: 'warning'
    })
  }

  // 4. 最近存活在线验证
  if (job.lastSeen) {
    items.push({
      title: '存活验证',
      date: formatDisplayDate(job.lastSeen),
      relative: formatTimeAgo(job.lastSeen),
      desc: '爬虫最近一次验证该岗位仍在源平台在线存活',
      tagType: 'info'
    })
  }

  return items
}
