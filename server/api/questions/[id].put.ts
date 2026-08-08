import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    return { success: false, error: 'Missing question id' }
  }

  try {
    const body = await readBody(event)
    const { serialNo, title, themeCategory, subCategory, tags, answer } = body

    const data: any = {}
    if (serialNo !== undefined) data.serialNo = serialNo ? parseInt(serialNo) : null
    if (title !== undefined) data.title = title
    if (themeCategory !== undefined) data.themeCategory = themeCategory
    if (subCategory !== undefined) data.subCategory = subCategory
    if (tags !== undefined) data.tags = tags ? JSON.stringify(tags) : null
    if (answer !== undefined) data.answer = answer

    const question = await prisma.questionBank.update({
      where: { id },
      data
    })

    return { success: true, data: question }
  } catch (error: any) {
    console.error('Error updating question:', error)
    return { success: false, error: error.message }
  }
})
