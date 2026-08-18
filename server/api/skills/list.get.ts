import { getPrisma } from '#prisma'
import { SKILL_REGISTRY } from '~/server/utils/aiSkills'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  try {
    let skills = await prisma.aiSkill.findMany({
      orderBy: { createdAt: 'asc' }
    })

    if (skills.length === 0) {
      // Seed with initial skills
      const initialSkills = SKILL_REGISTRY.map(skill => {
        const { systemPrompt, userPrompt } = skill.generatePrompt('{{JD_TEXT}}', '{{RESUME_TEXT}}')
        return {
          id: skill.id,
          name: skill.name,
          description: skill.description || '',
          systemPrompt,
          userPrompt,
          isActive: true
        }
      })
      
      await prisma.aiSkill.createMany({
        data: initialSkills
      })
      
      skills = await prisma.aiSkill.findMany({
        orderBy: { createdAt: 'asc' }
      })
    }

    return {
      success: true,
      data: skills
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
