import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  const query = getQuery(event)

  const keyword = (query.keyword as string || '').trim()
  const source = (query.source as string || 'all').trim()
  const page = parseInt(query.page as string) || 1
  const pageSize = parseInt(query.pageSize as string) || 50

  try {
    const where: any = {}

    if (keyword) {
      where.companyName = { contains: keyword }
    }

    if (source !== 'all') {
      where.source = source
    }

    const total = await prisma.blacklistedCompany.count({ where })
    const items = await prisma.blacklistedCompany.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })

    // 统计每家公司在本地岗位库中的关联岗位数
    const companyNames = items.map(i => i.companyName)
    let jobCountMap: Record<string, number> = {}

    if (companyNames.length > 0) {
      const jobs = await prisma.job.findMany({
        where: {
          OR: [
            { companyName: { in: companyNames } },
            { companyFullName: { in: companyNames } },
            { clientCompanyName: { in: companyNames } }
          ]
        },
        select: {
          companyName: true,
          companyFullName: true,
          clientCompanyName: true
        }
      })

      jobs.forEach(j => {
        companyNames.forEach(name => {
          if (j.companyName === name || j.companyFullName === name || j.clientCompanyName === name) {
            jobCountMap[name] = (jobCountMap[name] || 0) + 1
          }
        })
      })
    }

    const enrichedItems = items.map(item => ({
      ...item,
      jobCount: jobCountMap[item.companyName] || 0
    }))

    // 总览数据
    const totalCount = await prisma.blacklistedCompany.count()
    const chatCount = await prisma.blacklistedCompany.count({ where: { source: 'chat_rejection' } })
    const manualCount = await prisma.blacklistedCompany.count({ where: { source: 'manual' } })

    return {
      success: true,
      data: enrichedItems,
      total,
      stats: {
        total: totalCount,
        chatRejection: chatCount,
        manual: manualCount
      },
      page,
      pageSize
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    }
  }
})
