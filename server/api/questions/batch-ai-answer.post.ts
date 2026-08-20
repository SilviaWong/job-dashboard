import { getPrisma } from '#prisma'
import { callAI } from '../../utils/aiCaller'

const AI_ANSWER_PROMPT = `
你现在是一位资深的面试官和技术专家。用户正在准备技术面试，请你基于提供的【面试题目】和【核心考点】，并结合用户的【个人简历】，生成一份高质量的面试答案解析。

要求：
1. 答案必须紧密围绕【核心考点】展开，不要偏题。
2. 尽可能结合候选人【个人简历】中的项目经验或技术栈，提供具有个人特色的回答思路。如果简历中完全没有相关内容，则给出通用且专业的标准回答。
3. 回答要条理清晰，结构化输出（可以使用 Markdown 的列表、加粗等格式）。
4. 语气专业、自信，直接以求职者的口吻输出回答，不要废话，也不需要做自我介绍。
`;

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)

  try {
    // 获取 AI 配置和简历，只需获取一次
    const settings = await prisma.aiSettings.findUnique({
      where: { id: 'default' }
    })

    if (!settings || !settings.activeProfileId || !settings.profiles || !settings.resume) {
      return { success: false, error: '请先在系统设置中完成 AI 模型配置和个人简历设置' }
    }

    const profiles = JSON.parse(settings.profiles)
    const activeProfile = profiles.find((p: any) => p.id === settings.activeProfileId)

    if (!activeProfile || !activeProfile.url || !activeProfile.key || !activeProfile.model) {
      return { success: false, error: '当前激活的 AI 模型配置不完整' }
    }

    // 查询所有目标题目（aiAnswer 为空或 null）
    const questions = await prisma.standardQuestion.findMany({
      where: {
        OR: [
          { aiAnswer: null },
          { aiAnswer: '' }
        ]
      }
    })

    if (questions.length === 0) {
      return { success: false, error: '未找到需要补充 AI 解答的题目' }
    }

    let successCount = 0
    let index = 0
    const CONCURRENCY_LIMIT = 5

    // 工作线程函数
    const task = async () => {
      while (index < questions.length) {
        const q = questions[index++]
        try {
          const userPrompt = `
=== 面试题目 ===
${q.title}

=== 核心考点 ===
${q.corePoints || '无特别提示，请基于题目给出全面解答'}

=== 个人简历 ===
${settings.resume}

请开始你的回答：
`;
          // 调用统一的大模型请求工具函数
          const resultText = await callAI(AI_ANSWER_PROMPT, userPrompt, event)

          if (resultText) {
            await prisma.standardQuestion.update({
              where: { id: q.id },
              data: { aiAnswer: resultText.trim() }
            })
            successCount++
          }
        } catch (err) {
          console.error(`Failed to generate AI answer for question ${q.id}:`, err)
          // 继续处理下一题
        }
      }
    }

    // 启动5个并发任务
    await Promise.all(Array.from({ length: CONCURRENCY_LIMIT }).map(() => task()))

    return { success: true, count: successCount }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
