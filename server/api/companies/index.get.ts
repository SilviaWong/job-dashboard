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
        status: true
      }
    })

    const jobIds = jobs.map(j => j.jobId)

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

    // 1.3 查询 Boss 详情数据（使用单一 platform 条件代替几千个 IN 变量）
    let bossSingleDetailsMap: Record<string, any> = {}
    const bossDetails = await prisma.jobDetail.findMany({
      where: { platform: 'Boss直聘' },
      select: { jobId: true, rawData: true }
    })
    bossSingleDetailsMap = Object.fromEntries(bossDetails.map(d => [d.jobId, d]))

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

      // 处理 tags（在 DB 中是 JSON string）
      let parsedTags = []
      try {
        if (job.tags) parsedTags = JSON.parse(job.tags)
      } catch (e) {
        parsedTags = []
      }

      // 提取 Boss 职位补充详情
      let parsedBossSingleDetail = null;
      if (job.platform === 'Boss直聘' && bossSingleDetailsMap[job.jobId]) {
        try {
          parsedBossSingleDetail = JSON.parse(bossSingleDetailsMap[job.jobId].rawData)
        } catch (e) { }
      }
      const normalizedData = normalizeJobData(job, null, null, node.rawData, parsedBossSingleDetail)

      const { tags, ...jobWithoutRawData } = job as any;
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
