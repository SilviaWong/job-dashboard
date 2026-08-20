import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event).catch(() => null)
    const prisma = getPrisma(event)

    const ids = body?.ids
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return { success: false, message: 'Missing or invalid ids' }
    }

    let totalDeleted = 0
    const chunkSize = 100
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunkIds = ids.slice(i, i + chunkSize)
      
      // 1. 安全删除强关联子表记录 (如 Interview)
      try {
        await prisma.interview.deleteMany({
          where: { jobId: { in: chunkIds } }
        })
      } catch (e) {
        // ignore
      }

      // 2. 批量删除职位
      const result = await prisma.job.deleteMany({
        where: {
          id: { in: chunkIds }
        }
      })
      totalDeleted += result.count
    }

    return { success: true, count: totalDeleted }
  } catch (error: any) {
    console.error('Batch delete error:', error)
    return { success: false, error: error?.message || String(error) }
  }
})
