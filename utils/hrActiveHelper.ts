/**
 * HR 活跃度时效衰减与标准化计算工具
 * 解决离线/本地存储场景下瞬时相对时间（如“刚刚在线”）随时间推移失真的问题
 */

export type EffectiveHrLevel = 'active' | 'moderate' | 'zombie' | 'stale' | 'unknown'

export interface EffectiveHrResult {
  level: EffectiveHrLevel
  rawStatus: string
  displayStatus: string
  badgeText: string
  tooltip: string
  isStale: boolean
  daysAgo: number
}

/**
 * 根据职位数据动态计算经过时间衰减后的有效 HR 活跃度
 */
export function getEffectiveHrActive(job?: {
  hrActiveStatus?: string | null
  hrActiveLevel?: string | null
  lastSeen?: string | Date | null
  firstSeen?: string | Date | null
  createdAt?: string | Date | null
}): EffectiveHrResult {
  if (!job || !job.hrActiveStatus || !job.hrActiveStatus.trim()) {
    return {
      level: 'unknown',
      rawStatus: '',
      displayStatus: '-',
      badgeText: '',
      tooltip: '未获取到HR活跃状态',
      isStale: false,
      daysAgo: 0
    }
  }

  const rawStatus = job.hrActiveStatus.trim()
  const rawLevel = (job.hrActiveLevel || 'unknown') as 'active' | 'moderate' | 'zombie' | 'unknown'

  // 计算距离最近一次抓取/同步过去的天数
  const seenTime = job.lastSeen
    ? new Date(job.lastSeen).getTime()
    : (job.firstSeen ? new Date(job.firstSeen).getTime() : (job.createdAt ? new Date(job.createdAt).getTime() : Date.now()))

  const now = Date.now()
  const diffMs = Math.max(0, now - seenTime)
  const daysAgo = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  // 1. 僵尸岗位（负向指标具有持久单调性，随时间推移只会更不活跃，始终保留避坑警示）
  if (rawLevel === 'zombie') {
    const timeDesc = daysAgo === 0 ? '今天收录' : `${daysAgo}天前收录`
    return {
      level: 'zombie',
      rawStatus,
      displayStatus: rawStatus,
      badgeText: `💤 僵尸岗位 (${rawStatus})`,
      tooltip: `⚠️ 避坑提醒：抓取时HR状态为「${rawStatus}」（${timeDesc}），长期未在线沟通，极大概率无法得到回复！`,
      isStale: false,
      daysAgo
    }
  }

  // 2. 抓取时标记为活跃 (active)
  if (rawLevel === 'active') {
    // <= 2 天：判定为新鲜活跃
    if (daysAgo <= 2) {
      const syncText = daysAgo === 0 ? '今天同步' : (daysAgo === 1 ? '昨天同步' : '2天前同步')
      return {
        level: 'active',
        rawStatus,
        displayStatus: rawStatus,
        badgeText: `⚡ HR: ${rawStatus}`,
        tooltip: `🟢 真实活跃：HR状态「${rawStatus}」（${syncText}，时效性高）`,
        isStale: false,
        daysAgo
      }
    }

    // 3 ~ 7 天：轻微衰减为一般适中 (moderate)
    if (daysAgo <= 7) {
      return {
        level: 'moderate',
        rawStatus,
        displayStatus: `${rawStatus} (${daysAgo}天前)`,
        badgeText: `HR: ${rawStatus} (${daysAgo}天前)`,
        tooltip: `🟡 一般活跃：抓取时HR状态为「${rawStatus}」，距今已 ${daysAgo} 天未更新`,
        isStale: false,
        daysAgo
      }
    }

    // > 7 天：严重失效，标记为 stale
    return {
      level: 'stale',
      rawStatus,
      displayStatus: `${rawStatus} (${daysAgo}天前抓取·已失效)`,
      badgeText: `⏳ HR: ${rawStatus} (${daysAgo}天前·已失效)`,
      tooltip: `⏳ 时效失效：抓取于 ${daysAgo} 天前（当时状态: ${rawStatus}），因长期未重新同步，实际活跃状态可能已改变，不可作为即时活跃参考。`,
      isStale: true,
      daysAgo
    }
  }

  // 3. 抓取时标记为适中 (moderate)
  if (rawLevel === 'moderate') {
    // <= 14 天内保留适中
    if (daysAgo <= 14) {
      const display = daysAgo > 3 ? `${rawStatus} (${daysAgo}天前)` : rawStatus
      return {
        level: 'moderate',
        rawStatus,
        displayStatus: display,
        badgeText: `HR: ${display}`,
        tooltip: `🟡 HR活跃状态：${rawStatus}（${daysAgo === 0 ? '今天' : daysAgo + '天前'}同步）`,
        isStale: false,
        daysAgo
      }
    }

    // > 14 天衰减为失效
    return {
      level: 'stale',
      rawStatus,
      displayStatus: `${rawStatus} (${daysAgo}天前抓取·已失效)`,
      badgeText: `⏳ HR: ${rawStatus} (${daysAgo}天前·已失效)`,
      tooltip: `⏳ 时效失效：抓取于 ${daysAgo} 天前（当时状态: ${rawStatus}），当前实际状态未知。`,
      isStale: true,
      daysAgo
    }
  }

  // 4. 未知状态 (unknown)
  return {
    level: 'unknown',
    rawStatus,
    displayStatus: rawStatus,
    badgeText: `HR: ${rawStatus}`,
    tooltip: `HR状态: ${rawStatus}`,
    isStale: daysAgo > 14,
    daysAgo
  }
}
