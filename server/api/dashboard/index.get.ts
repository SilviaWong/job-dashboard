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
        tags: true
      }
    })

    const salaryDist = { '10k以下': 0, '10-20k': 0, '20-30k': 0, '30k以上': 0, '面议': 0 }
    const expDist: Record<string, number> = {}
    const skillsDist: Record<string, number> = {}

    for (const job of jobs) {
      // 1. 薪资分布解析
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

      // 2. 经验要求解析
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

      // 3. 技能关键词提取
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

    return {
      success: true,
      data: {
        salary: salaryDist,
        experience: expDist,
        skills: skillsDist,
        totalJobs: jobs.length
      }
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    }
  }
})
