import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const prisma = getPrisma(event)

  if (!body || !Array.isArray(body.ids) || body.ids.length === 0) {
    return { success: false, message: 'Missing or invalid ids' }
  }

  try {
    const dataToUpdate: any = {}
    if (body.status !== undefined) dataToUpdate.status = body.status
    if (body.isFavorited !== undefined) dataToUpdate.isFavorited = body.isFavorited
    if (body.isHidden !== undefined) dataToUpdate.isHidden = body.isHidden
    if (body.tags !== undefined) {
      dataToUpdate.tags = typeof body.tags === 'string' ? body.tags : JSON.stringify(body.tags)
    }

    const result = await prisma.job.updateMany({
      where: {
        id: { in: body.ids }
      },
      data: dataToUpdate
    })

    return { success: true, count: result.count }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
