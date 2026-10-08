import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!id) {
    return { success: false, message: '缺少面试记录 ID' }
  }

  try {
    const existing = await prisma.interview.findUnique({
      where: { id }
    })

    if (!existing) {
      return { success: false, message: '面试记录不存在' }
    }

    const updateData: any = {}
    if (body.time !== undefined) updateData.time = new Date(body.time)
    if (body.type !== undefined) updateData.type = body.type
    if (body.round !== undefined) updateData.round = body.round
    if (body.note !== undefined) updateData.note = body.note
    if (body.debrief !== undefined) updateData.debrief = body.debrief

    const updated = await prisma.interview.update({
      where: { id },
      data: updateData,
      include: {
        job: {
          select: {
            id: true,
            jobId: true,
            title: true,
            companyName: true,
            companyFullName: true,
            salary: true,
            platform: true,
            applyStatus: true
          }
        }
      }
    })

    return {
      success: true,
      data: updated
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || '更新面试记录失败'
    }
  }
})
