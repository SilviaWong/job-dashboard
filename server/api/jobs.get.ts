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
  const headhunterFilter = (query.headhunterFilter as string) || (filterExcludeHeadhunter ? 'direct' : 'all')
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

    // Headhunter filter (直招 / 猎头代招 / 全部)
    if (headhunterFilter === 'direct') {
      whereClause.isHeadhunter = false
    } else if (headhunterFilter === 'headhunter') {
      whereClause.isHeadhunter = true
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

    // 薪资范围过滤 (直接走数据库原生数值索引，无需全表扫入内存跑正则)
    if (salaryFilter !== 'all') {
      const [fMinStr, fMaxStr] = salaryFilter.split('-')
      const fMin = parseFloat(fMinStr)
      const fMax = fMaxStr ? parseFloat(fMaxStr) : 999
      andConditions.push({
        salaryAvg: {
          gte: fMin,
          lte: fMax
        }
      })
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
    
    // 仅在勾选了依赖内存集合的条件时采用轻量级两阶段查询；常规查询（含薪资范围）100% 走纯数据库原生分页
    if (aiDiagnosisFilter !== 'all' || filterMissingBossDetail) {
      const allJobStubs = await prisma.job.findMany({
        where: whereClause,
        select: {
          id: true,
          jobId: true,
          platform: true,
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
        
        return true
      })
      
      totalJobs = filteredStubs.length
      const pagedStubs = filteredStubs.slice((page - 1) * pageSize, page * pageSize)
      const pagedIds = pagedStubs.map(s => s.id)

      if (pagedIds.length > 0) {
        jobs = await prisma.job.findMany({
          where: { id: { in: pagedIds } },
          orderBy: { updatedAt: 'desc' },
          include: {
            detailPayload: {
              select: {
                jobDesc: true,
                jobUrl: true
              }
            }
          }
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
        take: pageSize,
        include: {
          detailPayload: {
            select: {
              jobDesc: true,
              jobUrl: true
            }
          }
        }
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

    // Merge everything for the frontend (直接利用结构化数据，告别运行时大规模 JSON.parse 与正则)
    const mergedJobs = jobs.map(job => {
      let parsedTags = []
      if (job.tags) {
        try {
          parsedTags = JSON.parse(job.tags)
        } catch (e) { }
      }

      let parsedSkills = []
      if (job.skills) {
        try {
          parsedSkills = JSON.parse(job.skills)
        } catch (e) { }
      }

      let parsedWelfare = []
      if (job.welfareList) {
        try {
          parsedWelfare = JSON.parse(job.welfareList)
        } catch (e) { }
      }

      const companyInfo = companyMap[`${job.platform}_${job.companyName}`];
      let companyWithoutRawData = null;
      if (companyInfo) {
        const { rawData: companyRaw, rawData2: companyRaw2, ...restCompany } = companyInfo;
        companyWithoutRawData = restCompany;
      }

      let normalizedData: any = null
      if (job.city || job.skills || job.detailPayload?.jobDesc) {
        normalizedData = {
          jobUrl: job.detailPayload?.jobUrl || '',
          publishDate: job.platformPublishTime || '',
          updateDate: job.platformUpdateTime || '',
          spiderDate: '',
          companyIndustry: companyInfo?.industry || '',
          companyStage: companyInfo?.stage || '',
          companyScale: companyInfo?.scale || '',
          brandName: job.companyName,
          companyFullName: job.companyFullName || job.companyName,
          companyId: job.companyId || '',
          hrName: job.hrName || '',
          hrPosition: job.hrPosition || '',
          hrCompanyName: job.companyName,
          welfareList: parsedWelfare,
          skills: parsedSkills,
          jobId: job.jobId,
          jobName: job.title,
          salaryRange: job.salary,
          jobDesc: job.detailPayload?.jobDesc || '暂无描述',
          experience: job.experience || job.education || '经验不限',
          degree: job.education || '学历不限',
          positionType: '',
          jobTags: parsedSkills,
          city: job.city || '',
          area: job.area || '',
          businessDistrict: job.businessDistrict || '',
          address: job.address || '',
          isHeadhunter: !!job.isHeadhunter,
          clientCompanyName: job.isHeadhunter ? job.companyFullName : '',
          dataSource: job.dataSource || '',
          jobStatus: job.status || '',
          hrActiveStatus: job.hrActiveStatus || '',
          hrActiveLevel: job.hrActiveLevel || 'unknown'
        }
      } else {
        let parsedRawData = {}
        try { parsedRawData = JSON.parse(job.rawData || '{}') } catch (e) { }
        let parsedRawData2 = {}
        try { parsedRawData2 = JSON.parse(job.rawData2 || '{}') } catch (e) { }
        normalizedData = normalizeJobData(job, parsedRawData, parsedRawData2, null, null)
      }

      const { rawData, rawData2, tags, detailPayload, ...jobWithoutRawData } = job;

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
