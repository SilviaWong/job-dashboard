import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)

  try {
    // 仅查询统计所需字段，不加载庞大的 rawData 字段，防止爆内存和 CPU 超时
    const jobs = await prisma.job.findMany({
      select: {
        title: true,
        salary: true,
        education: true,
        tags: true,
        platform: true,
        firstSeen: true,
        lastSeen: true,
        createdAt: true
      }
    })

    const salaryDist = { '10k以下': 0, '10-20k': 0, '20-30k': 0, '30k以上': 0, '面议': 0 }
    const expDist: Record<string, number> = {}
    const skillsDist: Record<string, number> = {}
    const platformDist: Record<string, number> = {}

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

      // 4. 薪资分布解析
      const salaryStr = String(job.salary || '').trim().toUpperCase()
      let maxK = -1

      const kMatch = salaryStr.match(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)K/)
      if (kMatch) {
        maxK = parseFloat(kMatch[2])
      } else {
        const wMatch = salaryStr.match(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)万/)
        if (wMatch) {
          maxK = parseFloat(wMatch[2]) * 10
        } else {
          const singleKMatch = salaryStr.match(/(\d+(?:\.\d+)?)K/)
          if (singleKMatch) {
            maxK = parseFloat(singleKMatch[1])
          } else {
            const singleWMatch = salaryStr.match(/(\d+(?:\.\d+)?)万/)
            if (singleWMatch) {
              maxK = parseFloat(singleWMatch[1]) * 10
            } else {
              const dMatch = salaryStr.match(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)元\/天/)
              if (dMatch) {
                maxK = (parseFloat(dMatch[2]) * 22) / 1000
              }
            }
          }
        }
      }

      if (maxK > 0) {
        if (maxK < 10) salaryDist['10k以下']++
        else if (maxK <= 20) salaryDist['10-20k']++
        else if (maxK <= 30) salaryDist['20-30k']++
        else salaryDist['30k以上']++
      } else {
        salaryDist['面议']++
      }

      // 5. 经验要求解析
      let exp = '其他/不限'
      const titleExp = job.title + ' ' + (job.tags || '')
      if (titleExp.includes('3-5') || titleExp.includes('3年') || titleExp.includes('4年') || titleExp.includes('3-4')) {
        exp = '3-5年'
      } else if (titleExp.includes('1-3') || titleExp.includes('1年') || titleExp.includes('2年') || titleExp.includes('1-2')) {
        exp = '1-3年'
      } else if (titleExp.includes('5-10') || titleExp.includes('5年') || titleExp.includes('6年') || titleExp.includes('7年') || titleExp.includes('8年') || titleExp.includes('9年')) {
        exp = '5-10年'
      } else if (titleExp.includes('10年') || titleExp.includes('十年')) {
        exp = '10年以上'
      } else if (titleExp.includes('应届') || titleExp.includes('实习') || titleExp.includes('在校')) {
        exp = '应届/实习'
      }
      expDist[exp] = (expDist[exp] || 0) + 1

      // 6. 技能关键词提取
      let parsedTags: string[] = []
      if (job.tags) {
        try {
          parsedTags = JSON.parse(job.tags)
        } catch (e) {
          parsedTags = []
        }
      }

      parsedTags.forEach(t => {
        if (t && typeof t === 'string' && t.trim() && !['学历不符', '经验不符'].includes(t.trim())) {
          const tag = t.trim()
          skillsDist[tag] = (skillsDist[tag] || 0) + 1
        }
      })

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
        kpi: {
          totalJobs: jobs.length,
          recent7d,
          recent30d,
          stale60d,
          newJobRatio: jobs.length > 0 ? ((recent7d / jobs.length) * 100).toFixed(1) : '0'
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
