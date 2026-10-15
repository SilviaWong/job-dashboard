import { getPrisma } from '#prisma'
import { tools } from '../../agent/tools'
import type { AgentContext } from '../../agent/types'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { scanCount = 10, minScore = 75, autoMoveToApply = false, resumeProfileId } = body || {}

  const prisma = getPrisma(event)

  try {
    const defaultProfile = await prisma.resumeProfile.findFirst({
      where: { isDefault: true }
    })
    const allProfiles = await prisma.resumeProfile.findMany({
      select: {
        id: true,
        title: true,
        targetRole: true,
        isDefault: true,
        content: true
      }
    })

    const context: AgentContext = {
      prisma,
      event,
      defaultResume: defaultProfile?.content || '',
      resumes: allProfiles
    }

    const batchTool = tools.find(t => t.name === 'batch_filter_and_recommend')
    if (!batchTool) {
      return { success: false, error: '未找到批量巡检工具' }
    }

    const result = await batchTool.execute(
      { scanCount, minScore, autoMoveToApply },
      context
    )

    return {
      success: true,
      data: result
    }
  } catch (err: any) {
    return {
      success: false,
      error: err.message
    }
  }
})
