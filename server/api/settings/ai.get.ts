import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  try {
    let settings = await prisma.aiSettings.findUnique({
      where: { id: 'default' }
    })
    
    // If no settings exist, create a default one
    if (!settings) {
      settings = await prisma.aiSettings.create({
        data: {
          id: 'default',
          activeProfileId: '1',
          profiles: JSON.stringify([
            { id: '1', name: 'DeepSeek', mode: 'openai', url: 'https://api.deepseek.com/v1', model: 'deepseek-chat', key: '' }
          ]),
          resume: ''
        }
      })
    }
    
    const parsedProfiles = JSON.parse(settings.profiles || '[]')
    const normalizedProfiles = parsedProfiles.map((p: any) => ({
      ...p,
      mode: p.mode || (p.model?.toLowerCase().includes('gemini') ? 'gemini' : p.model?.toLowerCase().includes('claude') ? 'claude' : 'openai')
    }))

    return {
      success: true,
      data: {
        ...settings,
        profiles: normalizedProfiles
      }
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
