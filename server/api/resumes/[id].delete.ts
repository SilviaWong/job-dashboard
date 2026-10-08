import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    return { success: false, error: '缺少简历 ID' }
  }

  try {
    const existing = await prisma.resumeProfile.findUnique({
      where: { id }
    })

    if (!existing) {
      return { success: false, error: '未找到指定简历' }
    }

    const totalCount = await prisma.resumeProfile.count()
    if (totalCount <= 1) {
      return { success: false, error: '系统需至少保留一份简历画像，不可全部删除' }
    }

    // 执行删除
    await prisma.resumeProfile.delete({
      where: { id }
    })

    // 如果删除的是默认简历，将剩余最新的一份设为默认
    if (existing.isDefault) {
      const nextDefault = await prisma.resumeProfile.findFirst({
        orderBy: { updatedAt: 'desc' }
      })

      if (nextDefault) {
        await prisma.resumeProfile.update({
          where: { id: nextDefault.id },
          data: { isDefault: true }
        })

        // 同步更新至 AiSettings
        await prisma.aiSettings.upsert({
          where: { id: 'default' },
          update: { resume: nextDefault.content },
          create: {
            id: 'default',
            activeProfileId: 'default',
            profiles: '[]',
            resume: nextDefault.content
          }
        })
      }
    }

    return {
      success: true,
      message: '简历画像已成功删除'
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || '删除简历失败'
    }
  }
})
