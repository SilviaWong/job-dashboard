import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  const query = getQuery(event)
  const page = parseInt(query.page as string) || 1
  const pageSize = parseInt(query.pageSize as string) || 20
  const keyword = query.keyword as string
  const domain = query.domain as string
  const tier = query.tier as string
  const tag = query.tag as string
  const sortBy = (query.sortBy as string) || 'hotness'

  try {
    const where: any = {}
    
    if (keyword) {
      where.OR = [
        { title: { contains: keyword } },
        { tags: { contains: keyword } },
        { corePoints: { contains: keyword } },
        { variants: { some: { title: { contains: keyword } } } }
      ]
    }
    
    if (domain) {
      where.domain = domain
    }

    if (tier && tier !== 'all') {
      where.tags = { contains: tier }
    } else if (tag) {
      where.tags = { contains: tag }
    }

    const total = await prisma.standardQuestion.count({ where })

    let orderBy: any = { variants: { _count: 'desc' } }
    if (sortBy === 'createdAt') {
      orderBy = { createdAt: 'desc' }
    }
    
    const questions = await prisma.standardQuestion.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        variants: {
          orderBy: { serialNo: 'asc' }
        }
      }
    })

    // Fetch meta stats for UI tabs and dynamic domain list
    const [t1Count, t2Count, t3Count, allCount, domainListResult] = await Promise.all([
      prisma.standardQuestion.count({ where: { tags: { contains: 'T1-必考' } } }),
      prisma.standardQuestion.count({ where: { tags: { contains: 'T2-进阶' } } }),
      prisma.standardQuestion.count({ where: { tags: { contains: 'T3-长尾' } } }),
      prisma.standardQuestion.count(),
      prisma.standardQuestion.findMany({
        select: { domain: true },
        distinct: ['domain'],
        where: { domain: { not: null } }
      })
    ])

    const domains = domainListResult
      .map((d: any) => d.domain)
      .filter(Boolean)
      .sort((a: string, b: string) => a.localeCompare(b, 'zh-CN'))

    return {
      success: true,
      data: questions,
      total,
      hasMore: (page * pageSize) < total,
      meta: {
        tierStats: {
          all: allCount,
          t1: t1Count,
          t2: t2Count,
          t3: t3Count
        },
        domains
      }
    }
  } catch (error: any) {
    console.error('Error fetching questions:', error)
    return {
      success: false,
      error: error.message
    }
  }
})
