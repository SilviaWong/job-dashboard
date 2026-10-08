import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    return { success: false, message: '缺少面试记录 ID' }
  }

  try {
    await prisma.interview.delete({
      where: { id }
    })

    return {
      success: true,
      message: '面试记录已成功删除'
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || '删除面试记录失败'
    }
  }
})
