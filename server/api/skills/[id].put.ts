import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!id) {
    return { success: false, error: 'Missing ID' }
  }

  try {
    const updatedSkill = await prisma.aiSkill.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        systemPrompt: body.systemPrompt,
        userPrompt: body.userPrompt,
        isActive: body.isActive
      }
    })
    return { success: true, data: updatedSkill }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
