import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!id) {
    return { success: false, error: '缺少简历 ID' }
  }

  const { title, targetRole, tags, content, isDefault } = body

  try {
    const existing = await prisma.resumeProfile.findUnique({
      where: { id }
    })

    if (!existing) {
      return { success: false, error: '未找到指定简历' }
    }

    const updateData: any = {}
    if (title !== undefined) updateData.title = title.trim()
    if (targetRole !== undefined) updateData.targetRole = targetRole.trim()
    if (tags !== undefined) {
      updateData.tags = Array.isArray(tags) ? JSON.stringify(tags) : (typeof tags === 'string' ? tags : '[]')
    }
    if (content !== undefined) updateData.content = content.trim()

    if (isDefault === true) {
      await prisma.resumeProfile.updateMany({
        where: { id: { not: id }, isDefault: true },
        data: { isDefault: false }
      })
      updateData.isDefault = true
    }

    const updated = await prisma.resumeProfile.update({
      where: { id },
      data: updateData
    })

    // 若当前更新的是默认简历，同步至 AiSettings.resume
    if (updated.isDefault && updated.content) {
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
      error: error.message || '更新简历失败'
    }
  }
})
