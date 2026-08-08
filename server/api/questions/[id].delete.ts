import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    return { success: false, error: 'Missing question id' }
  }

  try {
    await prisma.questionBank.delete({
      where: { id }
    })

    return { success: true }
  } catch (error: any) {
    console.error('Error deleting question:', error)
    return { success: false, error: error.message }
  }
})
