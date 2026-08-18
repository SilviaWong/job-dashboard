import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    return { success: false, error: 'Missing ID' }
  }

  try {
    await prisma.aiSkill.delete({
      where: { id }
    })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
