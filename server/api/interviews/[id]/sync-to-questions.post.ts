import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!id) {
    return { success: false, message: '缺少面试记录 ID' }
  }

  try {
    const interview = await prisma.interview.findUnique({
      where: { id },
      include: {
        job: {
          select: {
            title: true,
            companyName: true,
            companyFullName: true
          }
        }
      }
    })

    if (!interview) {
      return { success: false, message: '面试记录不存在' }
    }

    const company = interview.job?.companyFullName || interview.job?.companyName || '面试真题'
    const round = interview.round || '实战面试'
    const rawQuestions = Array.isArray(body.questions) ? body.questions : (body.title ? [body] : [])

    if (rawQuestions.length === 0) {
      return { success: false, message: '请提供至少一道待同步的面试真题' }
    }

    let savedCount = 0
    for (const q of rawQuestions) {
      if (!q.title || typeof q.title !== 'string' || !q.title.trim()) continue

      const title = q.title.trim()
      const domain = q.domain || '面试实战'
      const categoryTags = q.categoryTags || `${company}/${round}`
      const corePoints = q.corePoints || null
      const answerKey = q.answerKey || null

      // 查看是否已存在同名问题，避免无意义重复
      const existing = await prisma.standardQuestion.findFirst({
        where: { title }
      })

      if (existing) {
        // 如果存在同名题，给已有标准题追加变体真题
        await prisma.questionVariant.create({
          data: {
            standardQuestionId: existing.id,
            title: `${company}（${round}）：${title}`
          }
        })
      } else {
        // 创建新标准题，并同时带入变体
        const created = await prisma.standardQuestion.create({
          data: {
            title,
            domain,
            categoryTags,
            corePoints,
            answerKey,
            tags: JSON.stringify([company, round, '实战真题'])
          }
        })

        await prisma.questionVariant.create({
          data: {
            standardQuestionId: created.id,
            title: `${company}（${round}）：${title}`
          }
        })
      }
      savedCount++
    }

    return {
      success: true,
      message: `成功同步 ${savedCount} 道真题到标准题库`,
      count: savedCount
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || '同步题库失败'
    }
  }
})
