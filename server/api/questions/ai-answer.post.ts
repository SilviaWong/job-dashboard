import { getPrisma } from '#prisma'

const AI_ANSWER_PROMPT = `
你现在是一位资深的面试官和技术专家。用户正在准备技术面试，请你基于提供的【面试题目】和【核心考点】，并结合用户的【个人简历】，生成一份高质量的面试答案解析。

要求：
1. 答案必须紧密围绕【核心考点】展开，不要偏题。
2. 尽可能结合候选人【个人简历】中的项目经验或技术栈，提供具有个人特色的回答思路。如果简历中完全没有相关内容，则给出通用且专业的标准回答。
3. 回答要条理清晰，结构化输出（可以使用 Markdown 的列表、加粗等格式）。
4. 语气专业、自信，直接以求职者的口吻输出回答，不要废话，也不需要做自我介绍。
`;

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { title, corePoints } = body

  if (!title) {
    return { success: false, error: '缺少面试题目 (title)' }
  }
  
  const prisma = getPrisma(event)

  try {
    // Fetch AI Settings
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

    // Construct Prompt
    const prompt = `
=== 面试题目 ===
${title}

=== 核心考点 ===
${corePoints || '无特别提示，请基于题目给出全面解答'}

=== 个人简历 ===
${settings.resume}

请开始你的回答：
`;

    // Call AI API
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
        system: AI_ANSWER_PROMPT,
        messages: [{ role: 'user', content: prompt }]
      }
    } else if (isGemini && !finalUrl.includes('chat/completions')) {
      if (!finalUrl.includes(':generateContent')) {
        finalUrl = finalUrl.replace(/\/$/, '') + `/v1beta/models/${activeProfile.model}:generateContent`
      }
      headers['x-goog-api-key'] = key
      reqBody = {
        systemInstruction: { parts: [{ text: AI_ANSWER_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      }
    } else {
      headers['Authorization'] = `Bearer ${key}`
      reqBody = {
        model: activeProfile.model,
        messages: [
          { role: 'system', content: AI_ANSWER_PROMPT },
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

    return { success: true, data: resultText.trim() }

  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
