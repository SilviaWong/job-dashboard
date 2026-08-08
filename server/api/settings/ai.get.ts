import { getPrisma } from '../../utils/prisma'

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
            { id: '1', name: 'DeepSeek', url: 'https://api.deepseek.com/v1', model: 'deepseek-chat', key: '' }
          ]),
          resume: ''
        }
      })
    }
    
    return {
      success: true,
      data: {
        ...settings,
        profiles: JSON.parse(settings.profiles)
      }
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
