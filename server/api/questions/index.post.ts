import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  try {
    const body = await readBody(event)
    const { serialNo, title, themeCategory, subCategory, tags, answer } = body

    if (!title) {
      return { success: false, error: 'Title is required' }
    }

    const question = await prisma.questionBank.create({
      data: {
        serialNo: serialNo ? parseInt(serialNo) : null,
        title,
        themeCategory,
        subCategory,
        tags: tags ? JSON.stringify(tags) : null,
        answer
      }
    })

    return { success: true, data: question }
  } catch (error: any) {
    console.error('Error creating question:', error)
    return { success: false, error: error.message }
  }
})
