import { getPrisma } from '../utils/prisma'
import { normalizeJobData } from '../utils/jobNormalizer'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  const query = getQuery(event)
  const status = query.status as string || 'normal'
  const filterFavoritesOnly = query.filterFavoritesOnly === 'true'
  const filterShowBlacklisted = query.filterShowBlacklisted === 'true'
  const filterShowHidden = query.filterShowHidden === 'true'
  const platform = query.platform as string || 'all'
  const education = query.education as string || 'all'
  const keyword = query.keyword as string || ''

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
          { status: 'expired' }
        ]
      })
    } else {
      whereClause.isHidden = false
      if (status !== 'all') {
        whereClause.status = status
      }
    }

    // Favorites filter
    if (filterFavoritesOnly) {
      whereClause.isFavorited = true
    }

    // Platform filter
    if (platform !== 'all') {
      whereClause.platform = platform
    }

    // Education filter
    if (education !== 'all') {
      whereClause.rawData = { contains: education }
    }

    // Keyword filter
    if (keyword) {
      andConditions.push({
        OR: [
          { title: { contains: keyword } },
          { companyName: { contains: keyword } }
        ]
      })
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
      // If we are showing blacklisted, we still want to know which ones are blacklisted
      // for the frontend `isBlacklisted` flag.
      const blacklisted = await prisma.blacklistedCompany.findMany({
        select: { companyName: true }
      })
      blacklistedSet = new Set(blacklisted.map(b => b.companyName))
    }

    const totalJobs = await prisma.job.count({
      where: whereClause
    })

    const jobs = await prisma.job.findMany({
      where: whereClause,
      orderBy: {
        updatedAt: 'desc'
      },
      skip: (page - 1) * pageSize,
      take: pageSize
    })

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
    if (bossJobIds.length > 0) {
      const bossDetails = await prisma.bossSingleDetail.findMany({
        where: { jobId: { in: bossJobIds } }
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
