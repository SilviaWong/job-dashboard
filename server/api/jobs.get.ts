import { getPrisma } from '#prisma'
import { normalizeJobData } from '../utils/jobNormalizer'
import { resolveCityCode, STANDARD_CITY_CODE_MAP } from '../utils/jobDataParser'
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
  const city = (query.city as string) || (query.cityCode as string) || 'all'
  const education = query.education as string || 'all'
  const keyword = query.keyword as string || ''
  const salaryFilter = query.salaryFilter as string || 'all'
  const lifecycleFilter = query.lifecycleFilter as string || 'all'
  const hrActiveFilter = query.hrActiveFilter as string || 'all'
  const sortBy = query.sortBy as string || 'updatedAt'

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

    // City filter (支持按标准城市名、6位国标 cityCode 或 'other' 过滤)
    if (city !== 'all') {
      if (city === 'other') {
        andConditions.push({
          NOT: {
            OR: [
              { cityCode: { in: ['310100', '330100', '440300', '320500', '110100', '440100', '320100'] } },
              { city: { in: ['上海', '杭州', '深圳', '苏州', '北京', '广州', '南京'] } }
            ]
          }
        })
      } else if (/^\d{6}$/.test(city)) {
        const matchedName = Object.entries(STANDARD_CITY_CODE_MAP).find(([, code]) => code === city)?.[0]
        andConditions.push({
          OR: [
            { cityCode: city },
            ...(matchedName ? [{ city: matchedName }] : [])
          ]
        })
      } else {
        const code = resolveCityCode(city)
        andConditions.push({
          OR: [
            { city },
            ...(code ? [{ cityCode: code }] : [])
          ]
        })
      }
    }

    // Education filter
    if (education !== 'all') {
      whereClause.education = { contains: education }
    }

    if (keyword) {
      andConditions.push({
        OR: [
          { title: { contains: keyword } },
          { companyName: { contains: keyword } },
          { companyFullName: { contains: keyword } },
          { clientCompanyName: { contains: keyword } }
        ]
      })
    }

    // 职位生命周期过滤 (新发7天内 / 活跃30天内 / 3天内有刷新 / 常驻大于60天)
    if (lifecycleFilter !== 'all') {
      const now = new Date()
      if (lifecycleFilter === 'new_7d') {
        const date7dAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        const str7dAgo = date7dAgo.toISOString().slice(0, 10)
        andConditions.push({
          OR: [
            { firstSeen: { gte: date7dAgo } },
            { platformPublishTime: { gte: str7dAgo } }
          ]
        })
      } else if (lifecycleFilter === 'new_30d') {
        const date30dAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        const str30dAgo = date30dAgo.toISOString().slice(0, 10)
        andConditions.push({
          OR: [
            { firstSeen: { gte: date30dAgo } },
            { platformPublishTime: { gte: str30dAgo } }
          ]
        })
      } else if (lifecycleFilter === 'active_3d') {
        const date3dAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
        const str3dAgo = date3dAgo.toISOString().slice(0, 10)
        andConditions.push({
          OR: [
            { lastSeen: { gte: date3dAgo } },
            { platformUpdateTime: { gte: str3dAgo } }
          ]
        })
      } else if (lifecycleFilter === 'stale_60d') {
        const date60dAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
        andConditions.push({ firstSeen: { lte: date60dAgo } })
      }
    }

    // HR 活跃度过滤 (结合 lastSeen 时效衰减判断真实活跃与失效状态)
    if (hrActiveFilter !== 'all') {
      const now = new Date()
      const date7dAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const date30dAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

      if (hrActiveFilter === 'active') {
        // 真实活跃：抓取时标记为 active 且 7天内有同步过
        whereClause.hrActiveLevel = 'active'
        andConditions.push({ lastSeen: { gte: date7dAgo } })
      } else if (hrActiveFilter === 'moderate') {
        // 一般活跃：30天内同步且处于 moderate 范围
        whereClause.hrActiveLevel = 'moderate'
        andConditions.push({ lastSeen: { gte: date30dAgo } })
      } else if (hrActiveFilter === 'zombie') {
        // 僵尸岗位：负向指标具有持久单调性，长期未活跃避坑
        whereClause.hrActiveLevel = 'zombie'
      } else if (hrActiveFilter === 'stale') {
        // 状态失效：抓取时曾为 active 或 moderate，但超过 7 天未同步更新
        whereClause.hrActiveLevel = { in: ['active', 'moderate'] }
        andConditions.push({ lastSeen: { lt: date7dAgo } })
      } else {
        whereClause.hrActiveLevel = hrActiveFilter
      }
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
    
    // AI Diagnosis filter & AI Score Sorting
    const aiDiagnosisFilter = query.aiDiagnosisFilter as string || 'all'
    const isAiScoreSort = sortBy === 'aiScoreDesc' || sortBy === 'aiScoreAsc'
    let aiDiagnosedJobIdsSet = new Set<string>()
    let aiScoreMap = new Map<string, number>()
    if (aiDiagnosisFilter !== 'all' || isAiScoreSort) {
      const aiResults = await prisma.aiJobResult.findMany({ select: { jobId: true, score: true } })
      aiDiagnosedJobIdsSet = new Set(aiResults.map(r => r.jobId))
      aiScoreMap = new Map(aiResults.map(r => [r.jobId, r.score ?? -1]))
    }
    
    // Missing Boss Detail Filter (使用 Set 在内存判断，避免 notIn 生成超长 SQL 变量)
    let missingBossDetailSet = new Set<string>()
    if (filterMissingBossDetail) {
      const bossDetails = await prisma.jobDetail.findMany({ select: { jobId: true }, where: { platform: 'Boss直聘' } })
      missingBossDetailSet = new Set(bossDetails.map(d => d.jobId))
    }

    // Pre-fetch blacklisted companies for DB-level filtering if needed (双向穿透：同时检查品牌名、工商全称与代招公司)
    let blacklistedSet = new Set<string>()
    if (!filterShowBlacklisted) {
      const blacklisted = await prisma.blacklistedCompany.findMany({
        select: { companyName: true }
      })
      const blacklistedNames = blacklisted.map(b => b.companyName)
      if (blacklistedNames.length > 0) {
        andConditions.push({
          companyName: { notIn: blacklistedNames },
          OR: [
            { companyFullName: null },
            { companyFullName: { notIn: blacklistedNames } }
          ]
        })
        andConditions.push({
          OR: [
            { clientCompanyName: null },
            { clientCompanyName: { notIn: blacklistedNames } }
          ]
        })
      }
      blacklistedSet = new Set(blacklistedNames)
    } else {
      const blacklisted = await prisma.blacklistedCompany.findMany({
        select: { companyName: true }
      })
      blacklistedSet = new Set(blacklisted.map(b => b.companyName))
    }

    if (andConditions.length > 0) {
      whereClause.AND = andConditions
    }

    let totalJobs = 0
    let jobs: any[] = []

    // 构建排序规则
    let orderBy: any = { updatedAt: 'desc' }
    if (sortBy === 'firstSeen') {
      orderBy = { firstSeen: 'desc' }
    } else if (sortBy === 'publishTime') {
      orderBy = [
        { platformPublishTime: 'desc' },
        { firstSeen: 'desc' }
      ]
    } else if (sortBy === 'updateTime') {
      orderBy = [
        { platformUpdateTime: 'desc' },
        { lastSeen: 'desc' }
      ]
    } else if (sortBy === 'salaryDesc') {
      orderBy = { salaryAvg: 'desc' }
    } else if (sortBy === 'salaryAsc') {
      orderBy = { salaryAvg: 'asc' }
    } else {
      orderBy = { updatedAt: 'desc' }
    }

    // 定义轻量级 Job 查询字段，严禁把超大 rawData/rawData2 读入内存
    const jobListSelect = {
      id: true,
      jobId: true,
      title: true,
      companyName: true,
      companyFullName: true,
      companyId: true,
      salary: true,
      location: true,
      education: true,
      platform: true,
      status: true,
      dataSource: true,
      isFavorited: true,
      isHidden: true,
      tags: true,
      createdAt: true,
      updatedAt: true,
      firstSeen: true,
      lastSeen: true,
      descHash: true,
      platformPublishTime: true,
      platformUpdateTime: true,
      hrActiveStatus: true,
      hrActiveLevel: true,
      hrName: true,
      hrPosition: true,
      isHeadhunter: true,
      clientCompanyName: true,
      clientIndustry: true,
      clientScale: true,
      clientStage: true,
      salaryMin: true,
      salaryMax: true,
      salaryAvg: true,
      salaryMonths: true,
      province: true,
      city: true,
      cityCode: true,
      area: true,
      businessDistrict: true,
      address: true,
      experience: true,
      expMinYears: true,
      expMaxYears: true,
      skills: true,
      welfareList: true,
      applyStatus: true,
      detailPayload: {
        select: {
          jobDesc: true,
          jobUrl: true
        }
      }
    }
    
    // 仅在勾选了依赖内存集合或 AI 评分排序的条件时采用轻量级两阶段查询；常规查询 100% 走纯数据库原生分页
    if (aiDiagnosisFilter !== 'all' || filterMissingBossDetail || isAiScoreSort) {
      const allJobStubs = await prisma.job.findMany({
        where: whereClause,
        select: {
          id: true,
          jobId: true,
          platform: true,
          updatedAt: true
        },
        orderBy: orderBy
      })
      
      let filteredStubs = allJobStubs.filter(job => {
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

      // AI 评分排序支持
      if (sortBy === 'aiScoreDesc') {
        filteredStubs.sort((a, b) => (aiScoreMap.get(b.jobId) ?? -1) - (aiScoreMap.get(a.jobId) ?? -1))
      } else if (sortBy === 'aiScoreAsc') {
        filteredStubs.sort((a, b) => (aiScoreMap.get(a.jobId) ?? 999) - (aiScoreMap.get(b.jobId) ?? 999))
      }
      
      totalJobs = filteredStubs.length
      const pagedStubs = filteredStubs.slice((page - 1) * pageSize, page * pageSize)
      const pagedIds = pagedStubs.map(s => s.id)

      if (pagedIds.length > 0) {
        const rawFetchedJobs = await prisma.job.findMany({
          where: { id: { in: pagedIds } },
          select: jobListSelect
        })
        const idOrder = new Map(pagedIds.map((id, idx) => [id, idx]))
        jobs = rawFetchedJobs.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0))
      } else {
        jobs = []
      }
    } else {
      totalJobs = await prisma.job.count({
        where: whereClause
      })

      jobs = await prisma.job.findMany({
        where: whereClause,
        orderBy: orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: jobListSelect
      })
    }

    // Extract jobIds to query related decoupled data
    const jobIds = jobs.map(j => j.jobId)

    // Batch query AI Results (仅针对当前页 20 条职位)
    const aiResults = await prisma.aiJobResult.findMany({
      where: { jobId: { in: jobIds } }
    })
    const aiResultMap = Object.fromEntries(aiResults.map(a => [a.jobId, a]))

    // Extract unique company queries based on name and platform
    const companyQueries = jobs
      .filter(j => j.companyName && j.platform)
      .map(j => ({ companyName: j.companyName, sourcePlatform: j.platform }));
    const uniqueCompanyQueries = Array.from(new Set(companyQueries.map(q => JSON.stringify(q)))).map(q => JSON.parse(q));

    // Batch query companies (精简 select，不拉取任何 rawData)
    const companies = uniqueCompanyQueries.length > 0 ? await prisma.company.findMany({
      where: { OR: uniqueCompanyQueries },
      select: {
        companyName: true,
        companyFullName: true,
        sourcePlatform: true,
        companyId: true,
        industry: true,
        scale: true,
        stage: true,
        companyType: true,
        creditCode: true,
        logo: true,
        isAgency: true
      }
    }) : [];
    const companyMap = Object.fromEntries(companies.map(c => [`${c.sourcePlatform}_${c.companyName}`, c]));

    // 跨平台同岗位识别：检测当前页职位在其他招聘平台是否有同名直招岗位
    const pageJobTitles = Array.from(new Set(jobs.map(j => j.title).filter(Boolean)))
    let crossPlatformMap = new Map<string, string[]>()
    if (pageJobTitles.length > 0) {
      const candidates = await prisma.job.findMany({
        where: {
          title: { in: pageJobTitles },
          status: { not: 'deleted' }
        },
        select: {
          title: true,
          companyName: true,
          companyFullName: true,
          city: true,
          platform: true
        }
      })
      for (const cand of candidates) {
        const coKey = (cand.companyFullName || cand.companyName || '').trim()
        const tKey = (cand.title || '').trim().toLowerCase()
        const cKey = (cand.city || '').trim()
        if (!coKey || !tKey) continue
        const comboKey = `${coKey}__${tKey}__${cKey}`
        if (!crossPlatformMap.has(comboKey)) crossPlatformMap.set(comboKey, [])
        const list = crossPlatformMap.get(comboKey)!
        if (!list.includes(cand.platform)) list.push(cand.platform)
      }
    }

    // Helper to filter out corrupted JSON/control-character fragments defensively
    const cleanField = (val: any): string => {
      if (!val || typeof val !== 'string') return ''
      const trimmed = val.trim()
      if (trimmed.includes('"') || trimmed.includes('{') || trimmed.includes('}') || trimmed.includes(']') || /[\x00-\x1F]/.test(trimmed)) {
        return ''
      }
      return trimmed
    }

    // Merge everything for the frontend (直接利用结构化数据，告别运行时大规模 JSON.parse 与正则)
    const mergedJobs = jobs.map(job => {
      let parsedTags: string[] = []
      if (job.tags) {
        try {
          const res = JSON.parse(job.tags)
          if (Array.isArray(res)) {
            parsedTags = res.filter((t: any) => typeof t === 'string' && !t.includes('"') && !/[\x00-\x1F]/.test(t))
          }
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

      const companyInfo = companyMap[`${job.platform}_${job.companyName}`] || null;
      const isEffectiveAgency = !!(job.isHeadhunter || companyInfo?.isAgency);
      let compIndustry = isEffectiveAgency ? '人力资源服务' : (companyInfo?.industry || '');

      const normalizedData = {
        jobUrl: job.detailPayload?.jobUrl || '',
        publishDate: cleanField(job.platformPublishTime),
        updateDate: cleanField(job.platformUpdateTime),
        spiderDate: '',
        companyIndustry: compIndustry,
        companyStage: isEffectiveAgency ? '' : (companyInfo?.stage || ''),
        companyScale: isEffectiveAgency ? '' : (companyInfo?.scale || ''),
        brandName: job.companyName,
        companyFullName: job.companyFullName || job.companyName,
        companyId: job.companyId || '',
        hrName: cleanField(job.hrName),
        hrPosition: cleanField(job.hrPosition),
        hrCompanyName: job.companyName,
        welfareList: parsedWelfare,
        skills: parsedSkills,
        jobId: job.jobId,
        jobName: job.title,
        salaryRange: job.salary,
        jobDesc: job.detailPayload?.jobDesc || '暂无描述',
        experience: cleanField(job.experience) || '经验不限',
        degree: cleanField(job.education) || '学历不限',
        positionType: '',
        jobTags: parsedSkills,
        city: cleanField(job.city) || '上海',
        cityCode: cleanField(job.cityCode) || '310100',
        area: cleanField(job.area),
        businessDistrict: cleanField(job.businessDistrict),
        address: cleanField(job.address),
        isHeadhunter: isEffectiveAgency,
        clientCompanyName: cleanField(job.clientCompanyName),
        clientIndustry: cleanField(job.clientIndustry),
        clientScale: cleanField(job.clientScale),
        clientStage: cleanField(job.clientStage),
        dataSource: job.dataSource || '',
        jobStatus: job.status || '',
        hrActiveStatus: cleanField(job.hrActiveStatus),
        hrActiveLevel: job.hrActiveLevel || 'unknown'
      }

      // 计算其他平台同时发布的记录
      const coKey = (job.companyFullName || job.companyName || '').trim()
      const tKey = (job.title || '').trim().toLowerCase()
      const cKey = (job.city || '').trim()
      const comboKey = `${coKey}__${tKey}__${cKey}`
      const matchedPlatforms = crossPlatformMap.get(comboKey) || []
      const otherPlatforms = matchedPlatforms.filter(p => p !== job.platform)

      const { tags, detailPayload, ...jobWithoutPayload } = job;

      return {
        ...jobWithoutPayload,
        tags: parsedTags,
        normalizedData: normalizedData,
        otherPlatforms: otherPlatforms,
        aiResult: aiResultMap[job.jobId] || null,
        company: companyInfo,
        isBlacklisted: blacklistedSet.has(job.companyName) || 
          (job.companyFullName ? blacklistedSet.has(job.companyFullName) : false) || 
          (job.clientCompanyName ? blacklistedSet.has(job.clientCompanyName) : false)
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
