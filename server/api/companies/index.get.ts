import { getPrisma } from '#prisma'
import { normalizeJobData } from '../../utils/jobNormalizer'
import { cleanCompanyName } from '../../utils/companyProcessors/types'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)

  const query = getQuery(event)
  const status = query.status as string || 'normal'

  let jobWhere: any = {
    status: {
      not: 'deleted'
    }
  }

  if (status === 'normal') {
    jobWhere.isHidden = false
    jobWhere.status = 'normal'
  }

  try {
    // 1. 获取所有存在并且未隐藏的 Job（按需选择必要字段，不加载沉重的 rawData 以免爆内存和 CPU）
    const jobs = await prisma.job.findMany({
      where: jobWhere,
      select: {
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
        tags: true,
        updatedAt: true,
        firstSeen: true,
        lastSeen: true,
        descHash: true,
        hrActiveStatus: true,
        hrActiveLevel: true,
        city: true,
        cityCode: true,
        area: true,
        businessDistrict: true,
        address: true,
        experience: true,
        skills: true,
        welfareList: true,
        hrName: true,
        hrPosition: true,
        isHeadhunter: true,
        clientCompanyName: true,
        clientIndustry: true,
        clientScale: true,
        clientStage: true,
        dataSource: true,
        platformPublishTime: true,
        platformUpdateTime: true,
        status: true
      }
    })

    // 1.1 查询 ai_job_result 数据表（不使用超长 IN 列表，避免 too many SQL variables 报错）
    const aiResults = await prisma.aiJobResult.findMany({
      select: {
        jobId: true,
        score: true,
        matchLevel: true,
        resultText: true
      }
    })
    const aiResultMap = Object.fromEntries(aiResults.map(a => [a.jobId, a]))

    // 1.2 查询 blacklisted_company 数据表，获取黑名单公司
    const blacklisted = await prisma.blacklistedCompany.findMany({
      select: { companyName: true }
    })
    const blacklistedSet = new Set(blacklisted.map(b => b.companyName))

    // 2. 规范化与企业映射构建：仅加载结构化字段（避免全表扫描 9000+ 条大体积 rawData JSON）
    const companiesData = await prisma.company.findMany({
      select: {
        id: true,
        companyName: true,
        companyFullName: true,
        companyId: true,
        sourcePlatform: true,
        isAgency: true,
        industry: true,
        scale: true,
        stage: true,
        companyType: true,
        creditCode: true,
        logo: true,
        welfareList: true
      }
    })
    const companyMap = new Map<string, any>()

    for (const c of companiesData) {
      const cleanFull = cleanCompanyName(c.companyFullName)
      const cleanName = cleanCompanyName(c.companyName)
      const key = cleanFull || cleanName
      if (!key || key === '未知公司') continue

      const parsedCompany = {
        _recordIds: [c.id],
        companyName: key,
        companyFullName: cleanFull || cleanName,
        brandName: (cleanName && cleanName !== cleanFull) ? cleanName : '',
        sourcePlatform: c.sourcePlatform,
        companyId: c.companyId,
        isAgency: c.isAgency,
        industry: c.industry,
        scale: c.scale,
        stage: c.stage,
        companyType: c.companyType,
        creditCode: c.creditCode,
        logo: c.logo,
        welfareList: c.welfareList ? (() => { try { return JSON.parse(c.welfareList) } catch { return [] } })() : [],
        rawData: null as any,
        rawData2: null as any,
        rawData3: null as any,
      }

      if (!companyMap.has(key)) {
        companyMap.set(key, parsedCompany)
      } else {
        const existing = companyMap.get(key)
        existing._recordIds.push(c.id)
        if (c.isAgency) existing.isAgency = true
        if (!existing.creditCode && c.creditCode) existing.creditCode = c.creditCode
        if (!existing.industry && c.industry) existing.industry = c.industry
        if (!existing.scale && c.scale) existing.scale = c.scale
        if (!existing.stage && c.stage) existing.stage = c.stage
        if (!existing.companyType && c.companyType) existing.companyType = c.companyType
        if (!existing.logo && c.logo) existing.logo = c.logo
        if ((!existing.brandName || existing.brandName === key) && cleanName && cleanName !== key) {
          existing.brandName = cleanName
        }
        if ((!existing.welfareList || existing.welfareList.length === 0) && parsedCompany.welfareList?.length > 0) {
          existing.welfareList = parsedCompany.welfareList
        }
      }

      // 如果有简写品牌名，也建立索引便于通过简称反查到工商信息
      if (cleanName && cleanName !== key && !companyMap.has(cleanName)) {
        companyMap.set(cleanName, companyMap.get(key))
      }
    }

    // 3. 聚合职位：以主体全称（品牌名）为维度组织企业节点
    const resultNodes = new Map<string, any>()

    for (const job of jobs) {
      const cleanFull = cleanCompanyName(job.companyFullName)
      const cleanBrand = cleanCompanyName(job.companyName)
      const nodeKey = cleanFull || cleanBrand
      const platform = job.platform
      if (!nodeKey || nodeKey === '未知公司' || !platform) continue

      if (!resultNodes.has(nodeKey)) {
        const baseCompany = companyMap.get(nodeKey) || companyMap.get(cleanBrand) || {
          companyName: nodeKey,
          companyFullName: cleanFull || nodeKey,
          brandName: (cleanBrand && cleanBrand !== nodeKey) ? cleanBrand : '',
          sourcePlatform: platform,
          isAgency: false,
          rawData: null
        }

        const brandName = (cleanBrand && cleanBrand !== nodeKey) ? cleanBrand : (baseCompany.brandName || '')

        resultNodes.set(nodeKey, {
          ...baseCompany,
          companyName: nodeKey,
          companyFullName: cleanFull || nodeKey,
          brandName: brandName,
          jobs: [],
          platformSources: new Set<string>(),
          platformStats: {} as Record<string, { total: number; headhunter: number; direct: number }>,
          clientCompanies: new Set<string>(),
          clientIndustriesMap: new Map<string, number>(),
          clientScalesMap: new Map<string, number>(),
          cityMap: new Map<string, number>(),
          headhunterJobsCount: 0,
          directJobsCount: 0
        })
      }

      const node = resultNodes.get(nodeKey)

      // 准确维护职位所在城市分布
      const jobCity = job.city || (job.location ? job.location.split(/[\s·-]/)[0] : '')
      if (jobCity && typeof jobCity === 'string' && jobCity.trim() && jobCity !== '未知') {
        const c = jobCity.trim()
        node.cityMap.set(c, (node.cityMap.get(c) || 0) + 1)
      }

      // 准确维护各平台在招统计
      if (job.platform) {
        node.platformSources.add(job.platform)
        if (!node.platformStats[job.platform]) {
          node.platformStats[job.platform] = { total: 0, headhunter: 0, direct: 0 }
        }
        node.platformStats[job.platform].total++
        if (job.isHeadhunter) {
          node.platformStats[job.platform].headhunter++
        } else {
          node.platformStats[job.platform].direct++
        }
      }

      // 根据数据源里的实际数据标记猎头/代招状态并收集委托客户及客户画像
      if (job.isHeadhunter) {
        node.isAgency = true
        node.industry = '人力资源服务'
        node.headhunterJobsCount = (node.headhunterJobsCount || 0) + 1
        if (job.clientCompanyName && typeof job.clientCompanyName === 'string' && job.clientCompanyName.trim()) {
          node.clientCompanies.add(job.clientCompanyName.trim())
        }
        if (job.clientIndustry && typeof job.clientIndustry === 'string' && job.clientIndustry.trim()) {
          const ind = job.clientIndustry.trim()
          node.clientIndustriesMap.set(ind, (node.clientIndustriesMap.get(ind) || 0) + 1)
        }
        if (job.clientScale && typeof job.clientScale === 'string' && job.clientScale.trim()) {
          const sc = job.clientScale.trim()
          node.clientScalesMap.set(sc, (node.clientScalesMap.get(sc) || 0) + 1)
        }
      } else {
        node.directJobsCount = (node.directJobsCount || 0) + 1
      }

      // 对于猎头/代招公司，仅显示猎头公司自身名称，不附加客户简称或副品牌名，锁定为人力资源服务
      if (!node.isAgency) {
        if (cleanBrand && cleanBrand !== nodeKey && (!node.brandName || node.brandName === nodeKey)) {
          node.brandName = cleanBrand
        }
      } else {
        node.brandName = ''
        node.industry = '人力资源服务'
      }

      // 处理 tags 与结构化技能、福利
      let parsedTags = []
      try {
        if (job.tags) parsedTags = JSON.parse(job.tags)
      } catch (e) {
        parsedTags = []
      }

      let parsedSkills = []
      try {
        if (job.skills) parsedSkills = JSON.parse(job.skills)
      } catch (e) { }

      let parsedWelfare = []
      try {
        if (job.welfareList) parsedWelfare = JSON.parse(job.welfareList)
      } catch (e) { }

      const normalizedData = {
        jobUrl: '',
        publishDate: job.platformPublishTime || '',
        updateDate: job.platformUpdateTime || '',
        spiderDate: '',
        companyIndustry: node.industry || node.rawData?.companyIndustry || '',
        companyStage: node.stage || node.rawData?.companyStage || '',
        companyScale: node.scale || node.rawData?.companyScale || '',
        brandName: node.companyName,
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
        jobDesc: '',
        experience: job.experience || job.education || '经验不限',
        degree: job.education || '学历不限',
        positionType: '',
        jobTags: parsedSkills.length > 0 ? parsedSkills : parsedTags,
        city: job.city || '',
        area: job.area || '',
        businessDistrict: job.businessDistrict || '',
        address: job.address || '',
        isHeadhunter: !!job.isHeadhunter,
        clientCompanyName: job.clientCompanyName || '',
        dataSource: job.dataSource || '',
        jobStatus: job.status || '',
        hrActiveStatus: job.hrActiveStatus || '',
        hrActiveLevel: job.hrActiveLevel || 'unknown'
      }

      const { tags, ...jobWithoutRawData } = job as any;
      let companyWithoutRawData = null;
      if (node) {
        const { _recordIds, rawData: companyRaw, rawData2: companyRaw2, rawData3: companyRaw3, jobs: _jobs, platformSources: _platformSources, ...restCompany } = node as any;
        companyWithoutRawData = restCompany;
      }

      node.jobs.push({
        ...jobWithoutRawData,
        tags: parsedTags,
        normalizedData: normalizedData,
        aiResult: aiResultMap[job.jobId] || null,
        company: companyWithoutRawData,
        isBlacklisted: blacklistedSet.has(job.companyName) || (job.companyFullName && blacklistedSet.has(job.companyFullName)) || (job.clientCompanyName && blacklistedSet.has(job.clientCompanyName)) || blacklistedSet.has(nodeKey)
      })
    }

    // 4. 将 Map 转为 Array，按职位数量倒序排列，并把 Set 转成 Array
    let finalArray = Array.from(resultNodes.values()).map(c => {
      const sortedCitiesWithCount = Array.from((c.cityMap as Map<string, number>).entries())
        .sort((a, b) => b[1] - a[1])
        .map(([city, count]) => ({ city, count }))
      const cities = sortedCitiesWithCount.map(item => item.city)

      const sortedClientIndustries = Array.from((c.clientIndustriesMap as Map<string, number> || new Map()).entries())
        .sort((a, b) => b[1] - a[1])
        .map(([industry, count]) => ({ industry, count }))

      const sortedClientScales = Array.from((c.clientScalesMap as Map<string, number> || new Map()).entries())
        .sort((a, b) => b[1] - a[1])
        .map(([scale, count]) => ({ scale, count }))

      const { cityMap, clientIndustriesMap, clientScalesMap, ...rest } = c

      return {
        ...rest,
        cities,
        citiesWithCount: sortedCitiesWithCount,
        platformSources: Array.from(c.platformSources),
        clientCompanies: Array.from(c.clientCompanies || []),
        clientIndustriesWithCount: sortedClientIndustries,
        clientScalesWithCount: sortedClientScales,
        platformStats: c.platformStats || {}
      }
    })

    // Sort by jobs count descending
    finalArray.sort((a, b) => b.jobs.length - a.jobs.length)

    // Handle Search Query & Filters
    const queryParams = getQuery(event)
    const page = parseInt(queryParams.page as string) || 1
    const pageSize = parseInt(queryParams.pageSize as string) || 20
    const searchStr = (queryParams.query as string || '').toLowerCase()
    const agencyFilter = (queryParams.agencyFilter as string) || 'direct' // 'direct', 'agency', 'all'
    const platformFilter = (queryParams.platformFilter as string) || 'all'
    const cityFilter = (queryParams.city as string) || (queryParams.cityFilter as string) || 'all'

    if (agencyFilter === 'direct') {
      finalArray = finalArray.filter(c => !c.isAgency)
    } else if (agencyFilter === 'agency') {
      finalArray = finalArray.filter(c => c.isAgency)
    }

    if (platformFilter !== 'all') {
      finalArray = finalArray.filter(c => c.platformSources.some((p: string) => p.includes(platformFilter)))
    }

    if (cityFilter !== 'all') {
      finalArray = finalArray.filter(c => c.cities && c.cities.includes(cityFilter))
    }

    if (searchStr) {
      finalArray = finalArray.filter(c =>
        (c.companyName && c.companyName.toLowerCase().includes(searchStr)) ||
        (c.companyFullName && c.companyFullName.toLowerCase().includes(searchStr)) ||
        (c.brandName && c.brandName.toLowerCase().includes(searchStr)) ||
        (c.cities && c.cities.some((ct: string) => ct.toLowerCase().includes(searchStr))) ||
        (c.clientCompanies && c.clientCompanies.some((cli: string) => cli.toLowerCase().includes(searchStr))) ||
        c.jobs.some((j: any) =>
          (j.companyName && j.companyName.toLowerCase().includes(searchStr)) ||
          (j.companyFullName && j.companyFullName.toLowerCase().includes(searchStr)) ||
          (j.clientCompanyName && j.clientCompanyName.toLowerCase().includes(searchStr)) ||
          (j.city && j.city.toLowerCase().includes(searchStr))
        )
      )
    }

    const total = finalArray.length
    const startIndex = (page - 1) * pageSize
    const paginatedArray = finalArray.slice(startIndex, startIndex + pageSize)

    // 针对当前分页返回的企业，按需关联加载 rawData / rawData2 / rawData3（仅 20 家公司，极轻量）
    const pagedCompanyRecordIds: string[] = []
    for (const company of paginatedArray) {
      if (Array.isArray(company._recordIds)) {
        pagedCompanyRecordIds.push(...company._recordIds)
      }
    }

    if (pagedCompanyRecordIds.length > 0) {
      const rawDataRecords = await prisma.company.findMany({
        where: {
          id: { in: pagedCompanyRecordIds }
        },
        select: {
          id: true,
          rawData: true,
          rawData2: true,
          rawData3: true
        }
      })
      const rawMap = new Map(rawDataRecords.map(r => [r.id, r]))
      for (const company of paginatedArray) {
        if (Array.isArray(company._recordIds)) {
          for (const recId of company._recordIds) {
            const rawRec = rawMap.get(recId)
            if (rawRec) {
              if (!company.rawData && rawRec.rawData) {
                try { company.rawData = JSON.parse(rawRec.rawData) } catch {}
              }
              if (!company.rawData2 && rawRec.rawData2) {
                try { company.rawData2 = JSON.parse(rawRec.rawData2) } catch {}
              }
              if (!company.rawData3 && rawRec.rawData3) {
                try { company.rawData3 = JSON.parse(rawRec.rawData3) } catch {}
              }
            }
          }
        }
        delete company._recordIds
      }
    }

    // 针对当前分页返回的企业下的职位，按需关联 job_detail_payloads 补充 jobDesc 和 jobUrl
    const pagedJobRecordIds: string[] = []
    for (const company of paginatedArray) {
      if (Array.isArray(company.jobs)) {
        for (const j of company.jobs) {
          if (j.id) {
            pagedJobRecordIds.push(j.id)
          }
        }
      }
    }

    if (pagedJobRecordIds.length > 0) {
      const payloads = await prisma.jobDetailPayload.findMany({
        where: {
          jobRecordId: { in: pagedJobRecordIds }
        },
        select: {
          jobRecordId: true,
          jobDesc: true,
          jobUrl: true
        }
      })
      const payloadMap = new Map(payloads.map(p => [p.jobRecordId, p]))
      for (const company of paginatedArray) {
        if (Array.isArray(company.jobs)) {
          for (const j of company.jobs) {
            const payload = payloadMap.get(j.id)
            if (payload) {
              if (j.normalizedData) {
                j.normalizedData.jobDesc = payload.jobDesc || ''
                j.normalizedData.jobUrl = payload.jobUrl || ''
              }
              j.jobUrl = payload.jobUrl || ''
              j.jobDesc = payload.jobDesc || ''
            }
          }
        }
      }
    }

    return {
      success: true,
      data: paginatedArray,
      total
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
