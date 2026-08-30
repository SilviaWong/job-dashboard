import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)

  try {
    // 仅查询统计所需轻量字段，直接使用结构化数据，告别耗时正则解析
    const jobs = await prisma.job.findMany({
      select: {
        title: true,
        salaryAvg: true,
        expMinYears: true,
        expMaxYears: true,
        experience: true,
        skills: true,
        tags: true,
        platform: true,
        firstSeen: true,
        lastSeen: true,
        createdAt: true,
        hrActiveLevel: true
      }
    })

    const salaryDist = { '10k以下': 0, '10-20k': 0, '20-30k': 0, '30k以上': 0, '面议': 0 }
    const expDist: Record<string, number> = {}
    const skillsDist: Record<string, number> = {}
    const platformDist: Record<string, number> = {}
    const hrActiveDist = { active: 0, moderate: 0, zombie: 0, unknown: 0 }

    const now = Date.now()
    const ms7d = 7 * 24 * 60 * 60 * 1000
    const ms30d = 30 * 24 * 60 * 60 * 1000
    const ms60d = 60 * 24 * 60 * 60 * 1000

    let recent7d = 0
    let recent30d = 0
    let stale60d = 0

    const monthlyMap = new Map<string, number>()
    const weeklyMap = new Map<string, { label: string, timestamp: number, count: number }>()
    const dailyMap = new Map<string, number>()

    // 初始化最近30天的日期槽位，确保图表连续
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000)
      const dayStr = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      dailyMap.set(dayStr, 0)
    }

    for (const job of jobs) {
      // 平台分布
      const plat = job.platform || '未知'
      platformDist[plat] = (platformDist[plat] || 0) + 1

      // HR活跃度统计
      const hrLevel = (job.hrActiveLevel as 'active' | 'moderate' | 'zombie' | 'unknown') || 'unknown'
      if (hrActiveDist[hrLevel] !== undefined) {
        hrActiveDist[hrLevel]++
      } else {
        hrActiveDist.unknown++
      }

      // 时间计算（优先 firstSeen，降级 createdAt）
      const seenTime = job.firstSeen ? new Date(job.firstSeen).getTime() : (job.createdAt ? new Date(job.createdAt).getTime() : now)
      const diff = now - seenTime

      if (diff <= ms7d) recent7d++
      if (diff <= ms30d) recent30d++
      if (diff >= ms60d) stale60d++

      const seenDate = new Date(seenTime)
      if (!isNaN(seenDate.getTime())) {
        // 1. 月度趋势
        const monthKey = `${seenDate.getFullYear()}-${String(seenDate.getMonth() + 1).padStart(2, '0')}`
        monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + 1)

        // 2. 周度趋势 (计算该周周一与周日)
        const weekMonDate = new Date(seenDate.getTime())
        const dayNr = (seenDate.getDay() + 6) % 7
        weekMonDate.setDate(weekMonDate.getDate() - dayNr)
        weekMonDate.setHours(0, 0, 0, 0)

        const weekSunDate = new Date(weekMonDate.getTime())
        weekSunDate.setDate(weekSunDate.getDate() + 6)

        const weekKey = `${weekMonDate.getFullYear()}-${String(weekMonDate.getMonth() + 1).padStart(2, '0')}-${String(weekMonDate.getDate()).padStart(2, '0')}`
        const weekLabel = `${String(weekMonDate.getMonth() + 1).padStart(2, '0')}/${String(weekMonDate.getDate()).padStart(2, '0')}~${String(weekSunDate.getMonth() + 1).padStart(2, '0')}/${String(weekSunDate.getDate()).padStart(2, '0')}`
        
        if (!weeklyMap.has(weekKey)) {
          weeklyMap.set(weekKey, { label: weekLabel, timestamp: weekMonDate.getTime(), count: 0 })
        }
        weeklyMap.get(weekKey)!.count++

        // 3. 近30天每日趋势
        if (diff <= ms30d) {
          const dayKey = `${String(seenDate.getMonth() + 1).padStart(2, '0')}-${String(seenDate.getDate()).padStart(2, '0')}`
          if (dailyMap.has(dayKey)) {
            dailyMap.set(dayKey, (dailyMap.get(dayKey) || 0) + 1)
          }
        }
      }

      // 4. 薪资分布解析 (利用结构化数值直接判定，告别正则)
      if (job.salaryAvg !== null && job.salaryAvg !== undefined && job.salaryAvg > 0) {
        if (job.salaryAvg < 10) salaryDist['10k以下']++
        else if (job.salaryAvg <= 20) salaryDist['10-20k']++
        else if (job.salaryAvg <= 30) salaryDist['20-30k']++
        else salaryDist['30k以上']++
      } else {
        salaryDist['面议']++
      }

      // 5. 经验要求解析 (利用结构化工作年限判定)
      let exp = '其他/不限'
      if (job.expMinYears === 0 && job.expMaxYears === 0) {
        exp = '应届/实习'
      } else if (job.expMinYears !== null && job.expMinYears !== undefined) {
        if (job.expMinYears >= 10) {
          exp = '10年以上'
        } else if (job.expMinYears >= 5) {
          exp = '5-10年'
        } else if (job.expMinYears >= 3) {
          exp = '3-5年'
        } else if (job.expMinYears >= 1) {
          exp = '1-3年'
        }
      }
      expDist[exp] = (expDist[exp] || 0) + 1

      // 6. 技能关键词提取 (直接利用结构化 skills 数组)
      if (job.skills) {
        try {
          const parsedSkills = JSON.parse(job.skills)
          if (Array.isArray(parsedSkills)) {
            parsedSkills.forEach((tag: string) => {
              if (tag && typeof tag === 'string' && tag.trim()) {
                const cleanTag = tag.trim()
                skillsDist[cleanTag] = (skillsDist[cleanTag] || 0) + 1
              }
            })
          }
        } catch (e) { }
      }

      // 补充自定义标签
      if (job.tags) {
        try {
          const parsedTags = JSON.parse(job.tags)
          if (Array.isArray(parsedTags)) {
            parsedTags.forEach((t: string) => {
              if (t && typeof t === 'string' && t.trim() && !['学历不符', '经验不符'].includes(t.trim())) {
                const tag = t.trim()
                skillsDist[tag] = (skillsDist[tag] || 0) + 1
              }
            })
          }
        } catch (e) { }
      }

      // 从职位标题提取核心高频技术关键词作为词云补充
      const techKeywords = ['Java', 'Spring', 'SpringBoot', 'SpringCloud', 'Vue', 'React', 'Python', 'Go', 'Golang', 'MySQL', 'Redis', '微服务', 'Kafka', 'Docker', 'K8s', 'Kubernetes', 'MyBatis', '前端', '后端', '全栈', '架构师', '大模型', 'AI', 'Node.js', 'TypeScript', '分布式']
      techKeywords.forEach(kw => {
        if (job.title.toLowerCase().includes(kw.toLowerCase())) {
          skillsDist[kw] = (skillsDist[kw] || 0) + 1
        }
      })
    }

    // 格式化趋势数据
    const monthlyTrend = Array.from(monthlyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, count]) => ({ label, count }))

    const weeklyTrend = Array.from(weeklyMap.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-12) // 最近 12 周
      .map(w => ({ label: w.label, count: w.count }))

    const dailyTrend = Array.from(dailyMap.entries())
      .map(([label, count]) => ({ label, count }))

    return {
      success: true,
      data: {
        salary: salaryDist,
        experience: expDist,
        skills: skillsDist,
        platform: platformDist,
        totalJobs: jobs.length,
        hrActive: hrActiveDist,
        kpi: {
          totalJobs: jobs.length,
          recent7d,
          recent30d,
          stale60d,
          newJobRatio: jobs.length > 0 ? ((recent7d / jobs.length) * 100).toFixed(1) : '0',
          zombieRatio: jobs.length > 0 ? ((hrActiveDist.zombie / jobs.length) * 100).toFixed(1) : '0'
        },
        trends: {
          monthly: monthlyTrend,
          weekly: weeklyTrend,
          daily: dailyTrend
        }
      }
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    }
  }
})
