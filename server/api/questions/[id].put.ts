import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    return { success: false, error: 'Missing question id' }
  }

  try {
    const body = await readBody(event)
    const { title, domain, categoryTags, corePoints, answerKey, aiAnswer, tags } = body

    const data: any = {}
    if (title !== undefined) data.title = title
    if (domain !== undefined) data.domain = domain
    if (categoryTags !== undefined) data.categoryTags = categoryTags
    if (corePoints !== undefined) data.corePoints = corePoints
    if (tags !== undefined) data.tags = tags ? JSON.stringify(tags) : null
    if (answerKey !== undefined) data.answerKey = answerKey
    if (aiAnswer !== undefined) data.aiAnswer = aiAnswer

    const question = await prisma.standardQuestion.update({
      where: { id },
      data
    })

    return { success: true, data: question }
  } catch (error: any) {
    console.error('Error updating question:', error)
    return { success: false, error: error.message }
  }
})
