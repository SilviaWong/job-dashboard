import { getPrisma } from '#prisma'
import { callAI } from '~/server/utils/aiCaller'

export default defineEventHandler(async (event) => {
  const { jobId, skillId } = await readBody(event)
  if (!jobId || !skillId) {
    throw createError({ statusCode: 400, message: 'Missing jobId or skillId' })
  }

  const prisma = getPrisma(event)

  // 1. Get Job Description
  const job = await prisma.job.findUnique({ where: { id: jobId } })
  if (!job) {
    throw createError({ statusCode: 404, message: 'Job not found' })
  }
  const jdText = job.rawData || job.title

  // 2. Get User Resume
  const settings = await prisma.aiSettings.findUnique({ where: { id: 'default' } })
  const resumeText = settings?.resume || ''
  if (!resumeText) {
    throw createError({ statusCode: 400, message: '请先在系统设置中配置您的个人简历' })
  }

  // 3. Find Skill from DB
  const skill = await prisma.aiSkill.findUnique({ where: { id: skillId } })
  if (!skill) {
    throw createError({ statusCode: 404, message: 'Skill not found' })
  }

  if (!skill.isActive) {
    throw createError({ statusCode: 400, message: '该技能已被禁用' })
  }

  // 4. Generate Prompt by replacing placeholders
  const systemPrompt = skill.systemPrompt
    .replace(/\{\{JD_TEXT\}\}/g, jdText)
    .replace(/\{\{RESUME_TEXT\}\}/g, resumeText)

  const userPrompt = skill.userPrompt
    .replace(/\{\{JD_TEXT\}\}/g, jdText)
    .replace(/\{\{RESUME_TEXT\}\}/g, resumeText)

  // 5. Execute AI
  try {
    const result = await callAI(systemPrompt, userPrompt, event)

    // (Optional) Save to AiJobResult for specific skills, or just return.
    if (skill.name.includes('匹配') && result) {
      await prisma.aiJobResult.upsert({
        where: { jobId },
        create: {
          jobId,
          resultText: result
        },
        update: {
          resultText: result,
          updatedAt: new Date()
        }
      })
    }

    return {
      success: true,
      data: result
    }
  } catch (error: any) {
    return {
      success: false,
      message: error.message
    }
  }
})
