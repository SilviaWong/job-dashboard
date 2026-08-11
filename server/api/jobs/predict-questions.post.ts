import { getPrisma } from '#prisma'

const AI_PREDICT_QUESTIONS_PROMPT = `
你现在是一位资深的技术面试官和 HR 专家。请根据提供的【候选人简历】和【目标岗位 JD】，预测该候选人在此次面试中极有可能会被问到的 5-8 道面试题目。

要求：
1. 题目应当包含：
   - 针对简历中特定项目或技能的技术深度追问（硬技能）。
   - 基于岗位 JD 要求的核心能力的考察。
   - 1-2 道行为面试题（如团队协作、抗压能力、项目难点等）。
2. 每道题目后，请简要（一两句话）说明【考察意图】以及【建议答题思路】。
3. 请使用清晰的 Markdown 格式输出。
`;

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { jobId } = body

  if (!jobId) {
    return { success: false, error: '缺少 jobId' }
  }
  
  const prisma = getPrisma(event)

  try {
    // 1. Fetch Job
    const job = await prisma.job.findFirst({
      where: { jobId }
    })
    
    if (!job) {
      return { success: false, error: '职位不存在' }
    }

    // 2. Fetch AI Settings
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

    // 3. Construct Prompt
    let jobDetails = job.rawData ? JSON.parse(job.rawData) : {}
    let jobDescription = jobDetails['职位描述'] || jobDetails['jobDescription'] || ''
    
    const prompt = `
=== 目标岗位 JD ===
职位名称：${job.title}
公司名称：${job.companyName}
岗位职责与要求：
${jobDescription}

=== 候选人简历 ===
${settings.resume}

请开始预测面试题目：
`;

    // 4. Call AI API
    let finalUrl = activeProfile.url.trim()
    const isClaude = activeProfile.model.toLowerCase().includes('claude') || finalUrl.includes('anthropic')
    const isGemini = activeProfile.model.toLowerCase().includes('gemini')
    const key = activeProfile.key

    let headers: any = {
      'Content-Type': 'application/json'
    }
    let reqBody: any = {}

    if (isClaude && !finalUrl.includes('chat/completions')) {
      headers['x-api-key'] = key
      headers['anthropic-version'] = '2023-06-01'
      reqBody = {
        model: activeProfile.model,
        max_tokens: 2048,
        system: AI_PREDICT_QUESTIONS_PROMPT,
        messages: [{ role: 'user', content: prompt }]
      }
    } else if (isGemini && !finalUrl.includes('chat/completions')) {
      if (!finalUrl.includes(':generateContent')) {
        finalUrl = finalUrl.replace(/\/$/, '') + `/v1beta/models/${activeProfile.model}:generateContent`
      }
      headers['x-goog-api-key'] = key
      reqBody = {
        systemInstruction: { parts: [{ text: AI_PREDICT_QUESTIONS_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      }
    } else {
      headers['Authorization'] = `Bearer ${key}`
      reqBody = {
        model: activeProfile.model,
        messages: [
          { role: 'system', content: AI_PREDICT_QUESTIONS_PROMPT },
          { role: 'user', content: prompt }
        ],
        stream: false
      }
    }

    const response = await fetch(finalUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(reqBody)
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `${response.status} ${response.statusText}\n${errorText}` }
    }

    const data = await response.json()
    let resultText = ''

    if (isClaude && !finalUrl.includes('chat/completions')) {
      resultText = (data.content && data.content[0] && data.content[0].text) || ''
    } else if (isGemini && !finalUrl.includes('chat/completions')) {
      resultText = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) || ''
    } else {
      resultText = (data.choices && data.choices[0] && data.choices[0].message.content) || ''
    }

    if (!resultText) {
      return { success: false, error: 'AI 接口返回为空' }
    }

    // 5. Save to Prisma (upsert to AiJobResult)
    const predictedQuestions = resultText.trim();
    
    const aiResult = await prisma.aiJobResult.upsert({
      where: { jobId },
      update: {
        predictedQuestions
      },
      create: {
        jobId,
        predictedQuestions
      }
    })

    return { success: true, data: aiResult }

  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
