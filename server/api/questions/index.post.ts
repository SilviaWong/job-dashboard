import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  try {
    const body = await readBody(event)
    const { title, domain, categoryTags, corePoints, answerKey, aiAnswer, tags, variants } = body

    if (!title) {
      return { success: false, error: 'Title is required' }
    }

    const data: any = {
      title,
      domain,
      categoryTags,
      corePoints,
      answerKey,
      aiAnswer,
      tags: tags ? JSON.stringify(tags) : null
    }
    
    if (variants && Array.isArray(variants) && variants.length > 0) {
      data.variants = {
        create: variants.map((v: any) => ({
          serialNo: v.serialNo ? parseInt(v.serialNo) : null,
          title: v.title
        }))
      }
    }

    const question = await prisma.standardQuestion.create({
      data,
      include: {
        variants: true
      }
    })

    return { success: true, data: question }
  } catch (error: any) {
    console.error('Error creating question:', error)
    return { success: false, error: error.message }
  }
})
