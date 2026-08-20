import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const prisma = getPrisma(event)

  if (!body || !Array.isArray(body.ids) || body.ids.length === 0) {
    return { success: false, message: 'Missing or invalid ids' }
  }

  try {
    const ids: string[] = body.ids
    let totalDeleted = 0

    // 分批处理，防止超过 SQLite/D1 的参数上限
    const chunkSize = 200
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunkIds = ids.slice(i, i + chunkSize)
      const result = await prisma.job.deleteMany({
        where: {
          id: { in: chunkIds }
        }
      })
      totalDeleted += result.count
    }

    return { success: true, count: totalDeleted }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
