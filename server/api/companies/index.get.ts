import { getPrisma } from '#prisma'
import { normalizeJobData } from '../../utils/jobNormalizer'

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
    // 1. 获取所有存在并且未隐藏的 Job（排除黑名单我们可以在前端或者这里做，这里简单起见抓取所有正常数据）
    const jobs = await prisma.job.findMany({
      where: jobWhere,
      select: {
        id: true,
        jobId: true,
        title: true,
        companyName: true,
        companyFullName: true,
        salary: true,
        location: true,
        platform: true,
        tags: true,
        updatedAt: true,
        rawData: true,
        rawData2: true,
        status: true
      }
    })

    const jobIds = jobs.map(j => j.jobId)
    // 1.1 查询 ai_job_result 数据表，获取ai诊断数据
    const aiResults = await prisma.aiJobResult.findMany({
      where: { jobId: { in: jobIds } }
    })
    const aiResultMap = Object.fromEntries(aiResults.map(a => [a.jobId, a]))

    // 1.2 查询 blacklisted_company 数据表，获取黑名单公司
    const blacklisted = await prisma.blacklistedCompany.findMany({
      select: { companyName: true }
    })
    const blacklistedSet = new Set(blacklisted.map(b => b.companyName))

    const bossJobIds = jobs.filter(j => j.platform === 'Boss直聘').map(j => j.jobId)
    // 1.3 批量查询关联职位在 job_details 里的数据
    let bossSingleDetailsMap: Record<string, any> = {}
    if (bossJobIds.length > 0) {
      const bossDetails = await prisma.jobDetail.findMany({
        where: { jobId: { in: bossJobIds }, platform: 'Boss直聘' }
      })
      bossSingleDetailsMap = Object.fromEntries(bossDetails.map(d => [d.jobId, d]))
    }

    // 2. 构建并查集 (DSU) 合并公司名称和全称相同的记录
    const dsu = {
      parent: {} as Record<string, string>,
      find(i: string): string {
        if (this.parent[i] === undefined) {
          this.parent[i] = i;
        }
        if (this.parent[i] === i) {
          return i;
        }
        return this.parent[i] = this.find(this.parent[i]);
      },
      union(alias: string, fullName: string) {
        const rootAlias = this.find(alias);
        const rootFullName = this.find(fullName);
        if (rootAlias !== rootFullName) {
          // 强制使用 fullName 所在的集合作为根节点
          this.parent[rootAlias] = rootFullName;
        }
      }
    };

    for (const job of jobs) {
      if (job.companyName && job.companyName !== '未知公司') {
        if (job.companyFullName && job.companyFullName !== '未知公司') {
          dsu.union(job.companyName, job.companyFullName);
        }
      }
    }

    // 获取所有 Company 的详细信息，并加入并查集
    const companiesData = await prisma.company.findMany()
    for (const c of companiesData) {
      if (c.companyName && c.companyName !== '未知公司') {
        if (c.companyFullName && c.companyFullName !== '未知公司') {
          dsu.union(c.companyName, c.companyFullName);
        }
      }
    }

    const companyMap = new Map()
    for (const c of companiesData) {
      if (!c.companyName || c.companyName === '未知公司') continue;
      const canonicalName = dsu.find(c.companyName);
      if (!companyMap.has(canonicalName)) {
        companyMap.set(canonicalName, {
          companyName: canonicalName,
          sourcePlatform: c.sourcePlatform,
          companyId: c.companyId,
          isAgency: c.isAgency,
          rawData: c.rawData ? JSON.parse(c.rawData) : null,
          rawData2: c.rawData2 ? JSON.parse(c.rawData2) : null,
        })
      } else {
        const existing = companyMap.get(canonicalName);
        if (c.isAgency) {
          existing.isAgency = true;
        }
        if (!existing.rawData && c.rawData) {
          existing.rawData = JSON.parse(c.rawData);
          existing.sourcePlatform = c.sourcePlatform;
          existing.companyId = c.companyId;
        }
        if (!existing.rawData2 && c.rawData2) {
          existing.rawData2 = JSON.parse(c.rawData2);
        }
      }
    }

    // 3. 聚合：以 Canonical companyName 为 Key
    const resultNodes = new Map()

    for (const job of jobs) {
      const compName = job.companyName
      const platform = job.platform
      if (!compName || compName === '未知公司' || !platform) continue

      const nodeKey = dsu.find(compName)

      if (!resultNodes.has(nodeKey)) {
        // 如果在 Company 表里有该公司记录，就拿过来用；如果没有，就建一个只有名称的壳
        const baseCompany = companyMap.get(nodeKey) || { companyName: nodeKey, sourcePlatform: platform, isAgency: false, rawData: null }

        resultNodes.set(nodeKey, {
          ...baseCompany,
          jobs: [],
          platformSources: new Set()
        })
      }

      const node = resultNodes.get(nodeKey)

      // 添加平台来源
      if (job.platform) {
        node.platformSources.add(job.platform)
      }

      // 处理 tags（在 DB 中是 JSON string，或者原平台数据）
      let parsedTags = []
      try {
        if (job.tags) parsedTags = JSON.parse(job.tags)
      } catch (e) {
        parsedTags = []
      }

      // Fallback tags from rawData if custom tags is empty
      if (parsedTags.length === 0 && job.rawData) {
        const raw = JSON.parse(job.rawData)
        let rawTagsStr = raw['技能标签'] || (raw.jobInfo && raw.jobInfo.showSkills) || ''
        if (typeof rawTagsStr === 'string' && rawTagsStr) {
          parsedTags = rawTagsStr.split(',').filter(t => t.trim())
        }
      }

      // Add to jobs array
      const parsedRawData = job.rawData ? JSON.parse(job.rawData) : null
      let parsedRawData2 = job.rawData2 ? JSON.parse(job.rawData2) : null
      let parsedBossSingleDetail = null;
      if (job.platform === 'Boss直聘' && bossSingleDetailsMap[job.jobId]) {
        try {
          parsedBossSingleDetail = JSON.parse(bossSingleDetailsMap[job.jobId].rawData)
        } catch (e) { }
      }
      const normalizedData = normalizeJobData(job, parsedRawData, parsedRawData2, node.rawData, parsedBossSingleDetail)

      const { rawData, rawData2, tags, ...jobWithoutRawData } = job as any;
      let companyWithoutRawData = null;
      if (node) {
        const { rawData: companyRaw, rawData2: companyRaw2, jobs: _jobs, platformSources: _platformSources, ...restCompany } = node as any;
        companyWithoutRawData = restCompany;
      }

      node.jobs.push({
        ...jobWithoutRawData,
        tags: parsedTags,
        normalizedData: normalizedData,
        aiResult: aiResultMap[job.jobId] || null,
        company: companyWithoutRawData,
        isBlacklisted: blacklistedSet.has(job.companyName) || (job.companyFullName && blacklistedSet.has(job.companyFullName)) || blacklistedSet.has(nodeKey)
      })
    }

    // 4. 将 Map 转为 Array，按职位数量倒序排列，并把 Set 转成 Array
    let finalArray = Array.from(resultNodes.values()).map(c => ({
      ...c,
      platformSources: Array.from(c.platformSources)
    }))

    // Sort by jobs count descending
    finalArray.sort((a, b) => b.jobs.length - a.jobs.length)

    // Handle Search Query & Filters
    const queryParams = getQuery(event)
    const page = parseInt(queryParams.page as string) || 1
    const pageSize = parseInt(queryParams.pageSize as string) || 20
    const searchStr = (queryParams.query as string || '').toLowerCase()
    const agencyFilter = (queryParams.agencyFilter as string) || 'direct' // 'direct', 'agency', 'all'
    const platformFilter = (queryParams.platformFilter as string) || 'all'

    if (agencyFilter === 'direct') {
      finalArray = finalArray.filter(c => !c.isAgency)
    } else if (agencyFilter === 'agency') {
      finalArray = finalArray.filter(c => c.isAgency)
    }

    if (platformFilter !== 'all') {
      finalArray = finalArray.filter(c => c.platformSources.some((p: string) => p.includes(platformFilter)))
    }

    if (searchStr) {
      finalArray = finalArray.filter(c =>
        c.companyName.toLowerCase().includes(searchStr) ||
        c.jobs.some((j: any) =>
          (j.companyName && j.companyName.toLowerCase().includes(searchStr)) ||
          (j.companyFullName && j.companyFullName.toLowerCase().includes(searchStr))
        )
      )
    }

    const total = finalArray.length
    const startIndex = (page - 1) * pageSize
    const paginatedArray = finalArray.slice(startIndex, startIndex + pageSize)

    return {
      success: true,
      data: paginatedArray,
      total
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
