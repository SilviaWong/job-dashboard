import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  const body = await readBody(event)

  try {
    const newSkill = await prisma.aiSkill.create({
      data: {
        name: body.name,
        description: body.description,
        systemPrompt: body.systemPrompt,
        userPrompt: body.userPrompt,
        isActive: body.isActive ?? true
      }
    })
    return { success: true, data: newSkill }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
