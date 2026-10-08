import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)

  try {
    let profiles = await prisma.resumeProfile.findMany({
      orderBy: [
        { isDefault: 'desc' },
        { updatedAt: 'desc' }
      ]
    })

    // 自动数据平滑迁移：首次使用若 profiles 为空且 AiSettings 中有简历，自动生成初始主简历
    if (profiles.length === 0) {
      const settings = await prisma.aiSettings.findUnique({
        where: { id: 'default' }
      })

      if (settings?.resume && settings.resume.trim()) {
        const initial = await prisma.resumeProfile.create({
          data: {
            title: '通用主简历 (默认)',
            targetRole: 'Java开发工程师',
            tags: JSON.stringify(['默认', '全能']),
            content: settings.resume,
            isDefault: true
          }
        })
        profiles = [initial]
      }
    }

    const formatted = profiles.map(p => {
      let tagsArr: string[] = []
      try {
        tagsArr = p.tags ? JSON.parse(p.tags) : []
      } catch (e) {
        tagsArr = []
      }
      return {
        id: p.id,
        title: p.title,
        targetRole: p.targetRole || '',
        tags: tagsArr,
        content: p.content,
        contentLength: p.content ? p.content.length : 0,
        isDefault: p.isDefault,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
      }
    })

    return {
      success: true,
      data: formatted
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || '获取简历列表失败'
    }
  }
})
