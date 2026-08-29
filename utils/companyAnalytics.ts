/**
 * 企业招聘数据深度分析与横向对比工具
 * 借鉴 job-tracker 招聘雷达的核心统计算法
 */

export interface SalaryRange {
  minK: number | null
  maxK: number | null
}

export function parseSalary(salaryStr?: string): SalaryRange {
  if (!salaryStr) return { minK: null, maxK: null }
  const str = String(salaryStr).trim().toUpperCase()
  let minK: number | null = null
  let maxK: number | null = null

  const kMatch = str.match(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)K/)
  if (kMatch) {
    minK = parseFloat(kMatch[1])
    maxK = parseFloat(kMatch[2])
  } else {
    const wMatch = str.match(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)万/)
    if (wMatch) {
      minK = parseFloat(wMatch[1]) * 10
      maxK = parseFloat(wMatch[2]) * 10
    } else {
      const singleK = str.match(/(\d+(?:\.\d+)?)K/)
      if (singleK) {
        minK = maxK = parseFloat(singleK[1])
      } else {
        const singleW = str.match(/(\d+(?:\.\d+)?)万/)
        if (singleW) {
          minK = maxK = parseFloat(singleW[1]) * 10
        }
      }
    }
  }
  return { minK, maxK }
}

export interface CompanyAnalysis {
  companyName: string
  isAgency: boolean
  platformSources: string[]
  summary: {
    totalJobs: number
    activeJobs: number
    recent7d: number
    recent30d: number
    stale60d: number
    heatScore: number // 0 ~ 100
    avgSalaryMin: number | null
    avgSalaryMax: number | null
    avgSalaryMid: number | null
  }
  monthlyTrend: { month: string; count: number }[]
  salaryDist: { range: string; count: number }[]
  topTitles: { title: string; count: number }[]
  topTags: { tag: string; count: number }[]
  expDist: { name: string; value: number }[]
  cityDist: { name: string; value: number }[]
}

export function analyzeCompany(company: any): CompanyAnalysis {
  const jobs = Array.isArray(company?.jobs) ? company.jobs : []
  const now = Date.now()
  const ms7d = 7 * 24 * 60 * 60 * 1000
  const ms30d = 30 * 24 * 60 * 60 * 1000
  const ms60d = 60 * 24 * 60 * 60 * 1000

  let activeJobs = 0
  let recent7d = 0
  let recent30d = 0
  let stale60d = 0

  const monthlyMap = new Map<string, number>()
  const titleMap = new Map<string, number>()
  const tagMap = new Map<string, number>()
  const expMap = new Map<string, number>()
  const cityMap = new Map<string, number>()

  const validSalaries: { minK: number; maxK: number }[] = []

  const salaryBuckets = [
    { label: '<10K', min: 0, max: 10, count: 0 },
    { label: '10-15K', min: 10, max: 15, count: 0 },
    { label: '15-20K', min: 15, max: 20, count: 0 },
    { label: '20-30K', min: 20, max: 30, count: 0 },
    { label: '30-50K', min: 30, max: 50, count: 0 },
    { label: '>50K', min: 50, max: 9999, count: 0 }
  ]

  for (const job of jobs) {
    // 活跃状态
    const isClosed = job.status === 'expired' || job.status === 'closed' || job.isHidden
    if (!isClosed) activeJobs++

    // 时间计算
    const seenTime = job.firstSeen ? new Date(job.firstSeen).getTime() : (job.createdAt ? new Date(job.createdAt).getTime() : now)
    const diff = now - seenTime

    if (diff <= ms7d) recent7d++
    if (diff <= ms30d) recent30d++
    if (diff >= ms60d) stale60d++

    const seenDate = new Date(seenTime)
    if (!isNaN(seenDate.getTime())) {
      const monthKey = `${seenDate.getFullYear()}-${String(seenDate.getMonth() + 1).padStart(2, '0')}`
      monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + 1)
    }

    // 薪资
    const { minK, maxK } = parseSalary(job.salary)
    if (minK !== null && maxK !== null) {
      validSalaries.push({ minK, maxK })
      const mid = (minK + maxK) / 2
      for (const bucket of salaryBuckets) {
        if (mid >= bucket.min && mid < bucket.max) {
          bucket.count++
          break
        }
      }
    }

    // 职位名称
    const title = (job.title || '').trim()
    if (title) {
      titleMap.set(title, (titleMap.get(title) || 0) + 1)
    }

    // 技能标签
    let tags: string[] = []
    if (Array.isArray(job.tags)) {
      tags = job.tags
    } else if (typeof job.tags === 'string') {
      try { tags = JSON.parse(job.tags) } catch (e) { }
    }
    if (Array.isArray(job.normalizedData?.skills)) {
      tags = [...tags, ...job.normalizedData.skills]
    }
    const uniqueTags = new Set(tags.filter(t => t && typeof t === 'string' && t.trim() && !['学历不符', '经验不符'].includes(t.trim())))
    for (const t of uniqueTags) {
      tagMap.set(t, (tagMap.get(t) || 0) + 1)
    }

    // 经验
    const exp = job.normalizedData?.experience || '不限'
    expMap.set(exp, (expMap.get(exp) || 0) + 1)

    // 城市
    const city = job.normalizedData?.city || job.location?.split(/[\s·-]/)[0] || '未知'
    cityMap.set(city, (cityMap.get(city) || 0) + 1)
  }

  const totalJobs = jobs.length
  const heatScore = totalJobs > 0 ? Math.min(100, Math.round((recent30d / Math.max(totalJobs, 1)) * 100)) : 0

  const avgSalaryMin = validSalaries.length > 0 ? Math.round((validSalaries.reduce((acc, s) => acc + s.minK, 0) / validSalaries.length) * 10) / 10 : null
  const avgSalaryMax = validSalaries.length > 0 ? Math.round((validSalaries.reduce((acc, s) => acc + s.maxK, 0) / validSalaries.length) * 10) / 10 : null
  const avgSalaryMid = (avgSalaryMin !== null && avgSalaryMax !== null) ? Math.round(((avgSalaryMin + avgSalaryMax) / 2) * 10) / 10 : null

  const monthlyTrend = Array.from(monthlyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, count]) => ({ month, count }))

  const topTitles = Array.from(titleMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([title, count]) => ({ title, count }))

  const topTags = Array.from(tagMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([tag, count]) => ({ tag, count }))

  const expDist = Array.from(expMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  const cityDist = Array.from(cityMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  return {
    companyName: company?.companyName || '未知企业',
    isAgency: !!company?.isAgency,
    platformSources: company?.platformSources || [],
    summary: {
      totalJobs,
      activeJobs,
      recent7d,
      recent30d,
      stale60d,
      heatScore,
      avgSalaryMin,
      avgSalaryMax,
      avgSalaryMid
    },
    monthlyTrend,
    salaryDist: salaryBuckets.map(b => ({ range: b.label, count: b.count })),
    topTitles,
    topTags,
    expDist,
    cityDist
  }
}
