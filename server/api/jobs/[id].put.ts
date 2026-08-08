import { getPrisma } from '../../utils/prisma'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const prisma = getPrisma(event)

  if (!id) {
    return { success: false, message: 'Missing id' }
  }

  try {
    const dataToUpdate: any = {}
    if (body.status !== undefined) dataToUpdate.status = body.status
    if (body.isFavorited !== undefined) dataToUpdate.isFavorited = body.isFavorited
    if (body.isHidden !== undefined) dataToUpdate.isHidden = body.isHidden
    if (body.tags !== undefined) {
      dataToUpdate.tags = typeof body.tags === 'string' ? body.tags : JSON.stringify(body.tags)
    }

    const job = await prisma.job.update({
      where: { id },
      data: dataToUpdate
    })
    
    return { success: true, data: job }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
