import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const prisma = getPrisma(event)

  if (!id) {
    return { success: false, message: 'Missing id' }
  }

  try {
    const job = await prisma.job.delete({
      where: { id }
    })
    
    return { success: true, data: job }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
