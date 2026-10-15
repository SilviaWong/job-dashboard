import { getPrisma } from '#prisma'
import { runJobAgent } from '../../agent/runner'
import type { AgentContext } from '../../agent/types'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { message, history, resumeProfileId } = body || {}

  if (!message || typeof message !== 'string' || !message.trim()) {
    return { success: false, error: '消息内容不能为空' }
  }

  const prisma = getPrisma(event)

  try {
    // 构造上下文
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

    const result = await runJobAgent(message.trim(), history || [], context)
    return result
  } catch (err: any) {
    return {
      success: false,
      answer: `执行智能体任务时发生异常: ${err.message}`,
      steps: [],
      cards: [],
      error: err.message
    }
  }
})
