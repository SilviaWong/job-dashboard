import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    return { success: false, error: '缺少简历 ID' }
  }

  try {
    const target = await prisma.resumeProfile.findUnique({
      where: { id }
    })

    if (!target) {
      return { success: false, error: '未找到指定简历' }
    }

    // 1. 取消所有其他简历的默认状态
    await prisma.resumeProfile.updateMany({
      where: { id: { not: id }, isDefault: true },
      data: { isDefault: false }
    })

    // 2. 将当前简历设为默认
    const updated = await prisma.resumeProfile.update({
      where: { id },
      data: { isDefault: true }
    })

    // 3. 同步至 AiSettings.resume 以保持老接口兼容
    if (updated.content) {
      await prisma.aiSettings.upsert({
        where: { id: 'default' },
        update: { resume: updated.content },
        create: {
          id: 'default',
          activeProfileId: 'default',
          profiles: '[]',
          resume: updated.content
        }
      })
    }

    return {
      success: true,
      data: updated
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || '设置默认简历失败'
    }
  }
})
