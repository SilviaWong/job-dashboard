import { getPrisma } from '#prisma'

const AI_GENERATE_GREETING_PROMPT = `
你现在是一位求职专家。请根据提供的【候选人简历】和【目标岗位 JD】，为候选人写一段用于 Boss直聘 等招聘软件的打招呼语/自我介绍。

要求：
1. 语言简练，直击痛点，重点突出候选人与岗位最匹配的核心优势，篇幅控制在 100-200 字左右。
2. 语气真诚、自信，表现出对岗位的强烈意愿，礼貌得体。
3. 直接输出打招呼语的正文，不需要任何多余的解释或开头语。
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

请生成打招呼语/自我介绍：
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
        max_tokens: 1024,
        system: AI_GENERATE_GREETING_PROMPT,
        messages: [{ role: 'user', content: prompt }]
      }
    } else if (isGemini && !finalUrl.includes('chat/completions')) {
      if (!finalUrl.includes(':generateContent')) {
        finalUrl = finalUrl.replace(/\/$/, '') + `/v1beta/models/${activeProfile.model}:generateContent`
      }
      headers['x-goog-api-key'] = key
      reqBody = {
        systemInstruction: { parts: [{ text: AI_GENERATE_GREETING_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      }
    } else {
      headers['Authorization'] = `Bearer ${key}`
      reqBody = {
        model: activeProfile.model,
        messages: [
          { role: 'system', content: AI_GENERATE_GREETING_PROMPT },
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
    const intro = resultText.trim();
    
    const aiResult = await prisma.aiJobResult.upsert({
      where: { jobId },
      update: {
        intro
      },
      create: {
        jobId,
        intro
      }
    })

    return { success: true, data: aiResult }

  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
