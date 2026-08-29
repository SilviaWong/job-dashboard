import { getPrisma } from '#prisma'
import { normalizeJobData } from '../utils/jobNormalizer'
import { JobStatus } from '../../utils/enums'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  const query = getQuery(event)
  const status = query.status as string || JobStatus.NORMAL
  const filterFavoritesOnly = query.filterFavoritesOnly === 'true'
  const filterShowBlacklisted = query.filterShowBlacklisted === 'true'
  const filterShowHidden = query.filterShowHidden === 'true'
  const filterMissingBossDetail = query.filterMissingBossDetail === 'true'
  const filterExcludeHeadhunter = query.filterExcludeHeadhunter === 'true'
  const platform = query.platform as string || 'all'
  const education = query.education as string || 'all'
  const keyword = query.keyword as string || ''
  const salaryFilter = query.salaryFilter as string || 'all'
  const lifecycleFilter = query.lifecycleFilter as string || 'all'
  const hrActiveFilter = query.hrActiveFilter as string || 'all'

  const page = parseInt(query.page as string) || 1
  const pageSize = parseInt(query.pageSize as string) || 20

  try {
    let whereClause: any = {}
    let andConditions: any[] = []

    // Hidden & Status filter
    if (filterShowHidden) {
      // When showing hidden, we show both manually hidden (unsuitable) and expired jobs
      andConditions.push({
        OR: [
          { isHidden: true },
          { status: JobStatus.EXPIRED }
        ]
      })
    } else if (status === 'all') {
      // When 'all' is selected, we query all jobs in the data (including hidden/expired)
      // No isHidden or status filter is applied
    } else {
      whereClause.isHidden = false
      whereClause.status = status
    }

    // Favorites filter
    if (filterFavoritesOnly) {
      whereClause.isFavorited = true
    }

    // Headhunter filter (排除猎头/代招，仅看直招)
    if (filterExcludeHeadhunter) {
      whereClause.isHeadhunter = false
    }

    // Platform filter
    if (platform !== 'all') {
      whereClause.platform = platform
    }

    // Education filter
    if (education !== 'all') {
      whereClause.education = { contains: education }
    }

    if (keyword) {
      andConditions.push({
        OR: [
          { title: { contains: keyword } },
          { companyName: { contains: keyword } }
        ]
      })
    }

    // 职位生命周期过滤 (新发7天内 / 活跃30天内 / 常驻大于60天)
    if (lifecycleFilter !== 'all') {
      const now = new Date()
      if (lifecycleFilter === 'new_7d') {
        const date7dAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        andConditions.push({ firstSeen: { gte: date7dAgo } })
      } else if (lifecycleFilter === 'new_30d') {
        const date30dAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        andConditions.push({ firstSeen: { gte: date30dAgo } })
      } else if (lifecycleFilter === 'stale_60d') {
        const date60dAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
        andConditions.push({ firstSeen: { lte: date60dAgo } })
      }
    }

    // HR 活跃度过滤 (活跃 active / 适中 moderate / 僵尸岗 zombie)
    if (hrActiveFilter !== 'all') {
      whereClause.hrActiveLevel = hrActiveFilter
    }
    
    // AI Diagnosis filter
    const aiDiagnosisFilter = query.aiDiagnosisFilter as string || 'all'
    let aiDiagnosedJobIdsSet = new Set<string>()
    if (aiDiagnosisFilter !== 'all') {
      const aiResults = await prisma.aiJobResult.findMany({ select: { jobId: true } })
      aiDiagnosedJobIdsSet = new Set(aiResults.map(r => r.jobId))
    }
    
    // Missing Boss Detail Filter (使用 Set 在内存判断，避免 notIn 生成超长 SQL 变量)
    let missingBossDetailSet = new Set<string>()
    if (filterMissingBossDetail) {
      const bossDetails = await prisma.jobDetail.findMany({ select: { jobId: true }, where: { platform: 'Boss直聘' } })
      missingBossDetailSet = new Set(bossDetails.map(d => d.jobId))
    }

    if (andConditions.length > 0) {
      whereClause.AND = andConditions
    }

    // Pre-fetch blacklisted companies for DB-level filtering if needed
    let blacklistedSet = new Set<string>()
    if (!filterShowBlacklisted) {
      const blacklisted = await prisma.blacklistedCompany.findMany({
        select: { companyName: true }
      })
      const blacklistedNames = blacklisted.map(b => b.companyName)
      if (blacklistedNames.length > 0) {
        whereClause.companyName = { notIn: blacklistedNames }
      }
      blacklistedSet = new Set(blacklistedNames)
    } else {
      const blacklisted = await prisma.blacklistedCompany.findMany({
        select: { companyName: true }
      })
      blacklistedSet = new Set(blacklisted.map(b => b.companyName))
    }

    let totalJobs = 0
    let jobs: any[] = []
    
    // 如果有前端复杂过滤条件（薪资、AI状态、未抓取详情），采用两阶段查询：第一阶段仅拉取轻量 ID 和薪资/状态字段计算分页，第二阶段仅取当页 20 条详情
    if (salaryFilter !== 'all' || aiDiagnosisFilter !== 'all' || filterMissingBossDetail) {
      const allJobStubs = await prisma.job.findMany({
        where: whereClause,
        select: {
          id: true,
          jobId: true,
          platform: true,
          salary: true,
          updatedAt: true
        },
        orderBy: { updatedAt: 'desc' }
      })
      
      const filteredStubs = allJobStubs.filter(job => {
        // Missing Boss Detail Filter
        if (filterMissingBossDetail) {
          if (job.platform === 'Boss直聘' && missingBossDetailSet.has(job.jobId)) {
            return false
          }
        }

        // AI Diagnosis Filter
        if (aiDiagnosisFilter === 'diagnosed' && !aiDiagnosedJobIdsSet.has(job.jobId)) {
          return false
        }
        if (aiDiagnosisFilter === 'undiagnosed' && aiDiagnosedJobIdsSet.has(job.jobId)) {
          return false
        }

        // Salary Filter
        if (salaryFilter !== 'all') {
          const salaryStr = job.salary ? job.salary.toUpperCase() : ''
          let min = 0, max = 0
          
          const kMatch = salaryStr.match(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)K/)
          if (kMatch) {
            min = parseFloat(kMatch[1])
            max = parseFloat(kMatch[2])
          } else {
            const wMatch = salaryStr.match(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)万/)
            if (wMatch) {
              min = parseFloat(wMatch[1]) * 10
              max = parseFloat(wMatch[2]) * 10
            } else {
              const dMatch = salaryStr.match(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)元\/天/)
              if (dMatch) {
                min = (parseFloat(dMatch[1]) * 22) / 1000
                max = (parseFloat(dMatch[2]) * 22) / 1000
              } else {
                const singleKMatch = salaryStr.match(/(\d+(?:\.\d+)?)K/)
                if (singleKMatch) {
                  min = max = parseFloat(singleKMatch[1])
                } else {
                  const singleWMatch = salaryStr.match(/(\d+(?:\.\d+)?)万/)
                  if (singleWMatch) {
                    min = max = parseFloat(singleWMatch[1]) * 10
                  }
                }
              }
            }
          }
          
          if (min === 0 && max === 0) return false
          
          const [fMinStr, fMaxStr] = salaryFilter.split('-')
          const fMin = parseFloat(fMinStr)
          const fMax = fMaxStr ? parseFloat(fMaxStr) : 999
          
          const avg = (min + max) / 2
          if (avg < fMin || avg > fMax) return false
        }
        
        return true
      })
      
      totalJobs = filteredStubs.length
      const pagedStubs = filteredStubs.slice((page - 1) * pageSize, page * pageSize)
      const pagedIds = pagedStubs.map(s => s.id)

      if (pagedIds.length > 0) {
        jobs = await prisma.job.findMany({
          where: { id: { in: pagedIds } },
          orderBy: { updatedAt: 'desc' }
        })
      } else {
        jobs = []
      }
    } else {
      totalJobs = await prisma.job.count({
        where: whereClause
      })

      jobs = await prisma.job.findMany({
        where: whereClause,
        orderBy: {
          updatedAt: 'desc'
        },
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    }

    // Extract jobIds to query related decoupled data
    const jobIds = jobs.map(j => j.jobId)

    // Batch query AI Results
    const aiResults = await prisma.aiJobResult.findMany({
      where: { jobId: { in: jobIds } }
    })
    const aiResultMap = Object.fromEntries(aiResults.map(a => [a.jobId, a]))

    // Extract unique company queries based on name and platform
    const companyQueries = jobs
      .filter(j => j.companyName && j.platform)
      .map(j => ({ companyName: j.companyName, sourcePlatform: j.platform }));
    const uniqueCompanyQueries = Array.from(new Set(companyQueries.map(q => JSON.stringify(q)))).map(q => JSON.parse(q));

    // Batch query companies
    const companies = uniqueCompanyQueries.length > 0 ? await prisma.company.findMany({
      where: { OR: uniqueCompanyQueries }
    }) : [];
    const companyMap = Object.fromEntries(companies.map(c => [`${c.sourcePlatform}_${c.companyName}`, c]));

    // Batch query BossSingleDetails for Boss jobs
    const bossJobIds = jobs.filter(j => j.platform === 'Boss直聘').map(j => j.jobId);
    let bossSingleDetailsMap: Record<string, any> = {};
    if (jobIds.length > 0) {
      const bossDetails = await prisma.jobDetail.findMany({
        where: { jobId: { in: jobIds }, platform: 'Boss直聘' }
      });
      bossSingleDetailsMap = Object.fromEntries(bossDetails.map(d => [d.jobId, d]));
    }

    // Merge everything for the frontend
    const mergedJobs = jobs.map(job => {
      let parsedTags = []
      if (job.tags) {
        try {
          parsedTags = JSON.parse(job.tags)
        } catch (e) { }
      }
      let parsedRawData = {};
      try {
        parsedRawData = JSON.parse(job.rawData);
      } catch (e) { }
      let parsedRawData2 = {};
      try {
        parsedRawData2 = JSON.parse(job.rawData2);
      } catch (e) { }

      let parsedBossSingleDetail = null;
      if (job.platform === 'Boss直聘' && bossSingleDetailsMap[job.jobId]) {
        try {
          parsedBossSingleDetail = JSON.parse(bossSingleDetailsMap[job.jobId].rawData);
        } catch (e) { }
      }

      const companyInfo = companyMap[`${job.platform}_${job.companyName}`];
      let parsedCompanyRawData = null;
      let companyWithoutRawData = null;
      if (companyInfo) {
        const { rawData: companyRaw, ...restCompany } = companyInfo;
        companyWithoutRawData = restCompany;
        if (companyInfo.rawData) {
          try {
            parsedCompanyRawData = JSON.parse(companyInfo.rawData);
          } catch (e) { }
        }
      }

      const normalizedData = normalizeJobData(job, parsedRawData, parsedRawData2, parsedCompanyRawData, parsedBossSingleDetail);

      const { rawData, tags, ...jobWithoutRawData } = job;

      return {
        ...jobWithoutRawData,
        tags: parsedTags,
        normalizedData: normalizedData,
        aiResult: aiResultMap[job.jobId] || null,
        company: companyWithoutRawData,
        isBlacklisted: blacklistedSet.has(job.companyName)
      }
    })

    return {
      success: true,
      data: mergedJobs,
      total: totalJobs,
      hasMore: (page * pageSize) < totalJobs
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
