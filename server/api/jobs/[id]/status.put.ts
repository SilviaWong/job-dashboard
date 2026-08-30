import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const prisma = getPrisma(event)
  
  if (!id || !body.status) {
    return { success: false, message: 'Missing id or status' }
  }

  try {
    const existing = await prisma.job.findUnique({
      where: { id },
      select: { id: true, status: true, applyStatus: true, appliedAt: true }
    })

    const updateData: any = {
      status: body.status,
      applyStatus: body.status,
      statusUpdatedAt: new Date()
    }

    if (body.status === 'applied' && (!existing || !existing.appliedAt)) {
      updateData.appliedAt = new Date()
    }

    const job = await prisma.job.update({
      where: { id },
      data: updateData
    })

    // 阶段一双写：记录状态流转历史
    if (existing && existing.status !== body.status) {
      await prisma.jobStatusLog.create({
        data: {
          jobRecordId: id,
          fromStatus: existing.status || 'normal',
          toStatus: body.status,
          note: body.note || null
        }
      })
    }
    
    return { success: true, data: job }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

