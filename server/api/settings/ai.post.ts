import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const prisma = getPrisma(event)

  try {
    const updateData: any = {}
    if (body.activeProfileId !== undefined) updateData.activeProfileId = body.activeProfileId
    if (body.profiles !== undefined) updateData.profiles = JSON.stringify(body.profiles)
    if (body.resume !== undefined) updateData.resume = body.resume

    const settings = await prisma.aiSettings.upsert({
      where: { id: 'default' },
      update: updateData,
      create: {
        id: 'default',
        activeProfileId: body.activeProfileId || 'default',
        profiles: body.profiles ? JSON.stringify(body.profiles) : JSON.stringify([{ id: 'default', name: '默认配置', url: '', key: '', model: '' }]),
        resume: body.resume || ''
      }
    })
    
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
