import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  const body = await readBody(event)

  const { title, targetRole, tags, content, isDefault } = body

  if (!title || !title.trim()) {
    return { success: false, error: '简历画像名称不能为空' }
  }

  if (!content || !content.trim()) {
    return { success: false, error: '简历正文内容不能为空' }
  }

  try {
    const shouldBeDefault = Boolean(isDefault)

    // 如果设为默认，先将其他简历的默认状态取消
    if (shouldBeDefault) {
      await prisma.resumeProfile.updateMany({
        where: { isDefault: true },
        data: { isDefault: false }
      })
    }

    // 如果当前没有任何简历，强制第一份为默认
    const count = await prisma.resumeProfile.count()
    const finalDefault = count === 0 ? true : shouldBeDefault

    const profile = await prisma.resumeProfile.create({
      data: {
        title: title.trim(),
        targetRole: (targetRole || '').trim(),
        tags: Array.isArray(tags) ? JSON.stringify(tags) : (typeof tags === 'string' ? tags : '[]'),
        content: content.trim(),
        isDefault: finalDefault
      }
    })

    // 如果是默认简历，双写同步更新至 AiSettings.resume 以保持老接口兼容
    if (finalDefault) {
      await prisma.aiSettings.upsert({
        where: { id: 'default' },
        update: { resume: content.trim() },
        create: {
          id: 'default',
          activeProfileId: 'default',
          profiles: '[]',
          resume: content.trim()
        }
      })
    }

    return {
      success: true,
      data: profile
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || '创建简历画像失败'
    }
  }
})
