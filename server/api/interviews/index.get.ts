import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  const query = getQuery(event)

  const jobId = query.jobId as string | undefined
  const status = (query.status as string) || 'all'
  const search = (query.search as string) || ''
  const page = parseInt((query.page as string) || '1')
  const pageSize = parseInt((query.pageSize as string) || '50')

  try {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

    // 构建 where 条件
    const where: any = {}

    if (jobId) {
      where.jobId = jobId
    }

    if (status === 'upcoming') {
      where.time = { gte: startOfToday }
    } else if (status === 'today') {
      where.time = { gte: startOfToday, lte: endOfToday }
    } else if (status === 'past') {
      where.time = { lt: startOfToday }
    }

    if (search) {
      where.OR = [
        { round: { contains: search } },
        { type: { contains: search } },
        { note: { contains: search } },
        { debrief: { contains: search } },
        {
          job: {
            OR: [
              { title: { contains: search } },
              { companyName: { contains: search } },
              { companyFullName: { contains: search } }
            ]
          }
        }
      ]
    }

    // 统计总数与不同状态总数
    const [total, upcomingCount, todayCount, debriefedCount] = await Promise.all([
      prisma.interview.count({ where: jobId ? { jobId } : {} }),
      prisma.interview.count({
        where: {
          ...(jobId ? { jobId } : {}),
          time: { gte: startOfToday }
        }
      }),
      prisma.interview.count({
        where: {
          ...(jobId ? { jobId } : {}),
          time: { gte: startOfToday, lte: endOfToday }
        }
      }),
      prisma.interview.count({
        where: {
          ...(jobId ? { jobId } : {}),
          AND: [
            { debrief: { not: null } },
            { debrief: { not: '' } }
          ]
        }
      })
    ])

    const filteredTotal = await prisma.interview.count({ where })

    // 排序逻辑：upcoming优先按时间正序（最近的在前），历史按时间倒序
    const orderBy = status === 'upcoming' || status === 'today'
      ? { time: 'asc' as const }
      : { time: 'desc' as const }

    const interviews = await prisma.interview.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        job: {
          select: {
            id: true,
            jobId: true,
            title: true,
            companyName: true,
            companyFullName: true,
            salary: true,
            platform: true,
            location: true,
            applyStatus: true,
            status: true,
            rawData: false
          }
        }
      }
    })

    return {
      success: true,
      data: interviews,
      stats: {
        total,
        upcoming: upcomingCount,
        today: todayCount,
        debriefed: debriefedCount
      },
      pagination: {
        page,
        pageSize,
        total: filteredTotal
      }
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || '获取面试记录失败'
    }
  }
})
