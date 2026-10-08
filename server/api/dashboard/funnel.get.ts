import { getPrisma } from '#prisma'
import { computeFunnelAnalytics } from '../../utils/funnelAnalytics'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)

  try {
    const jobs = await prisma.job.findMany({
      where: {
        OR: [
          { applyStatus: { not: 'none' } },
          { isFavorited: true },
          { statusLogs: { some: {} } },
          { interviews: { some: {} } }
        ]
      },
      select: {
        id: true,
        jobId: true,
        title: true,
        companyName: true,
        salary: true,
        platform: true,
        applyStatus: true,
        isFavorited: true,
        appliedAt: true,
        statusUpdatedAt: true,
        createdAt: true,
        interviews: {
          select: { id: true, round: true, type: true, time: true },
          orderBy: { time: 'asc' }
        },
        statusLogs: {
          select: { fromStatus: true, toStatus: true, createdAt: true },
          orderBy: { createdAt: 'asc' }
        }
      }
    })

    const result = computeFunnelAnalytics(jobs as any)

    return {
      success: true,
      data: result
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || '获取求职转化效能分析失败'
    }
  }
})
