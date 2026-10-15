import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const prisma = getPrisma(event)

  if (!id) {
    return { success: false, message: 'Missing job id' }
  }

  try {
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        aiResults: {
          orderBy: { createdAt: 'desc' },
          take: 5
        },
        statusLogs: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    })

    if (!job) {
      return { success: false, message: 'Job not found' }
    }

    return { success: true, data: job }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
