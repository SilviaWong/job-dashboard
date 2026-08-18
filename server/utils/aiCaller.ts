import { getPrisma } from '#prisma'

export async function callAI(systemPrompt: string, userPrompt: string, event: any) {
  const prisma = getPrisma(event)
  
  // 1. Fetch AI Settings
  const settings = await prisma.aiSettings.findUnique({
    where: { id: 'default' }
  })

  if (!settings) {
    throw new Error('AI 配置未初始化，请先在设置中配置大模型')
  }

  const profiles = JSON.parse(settings.profiles)
  const activeProfile = profiles.find((p: any) => p.id === settings.activeProfileId)

  if (!activeProfile || !activeProfile.key) {
    throw new Error('未配置 API Key 或未选择激活的模型')
  }

  // 2. Call AI API using native fetch (supports OpenAI/Claude/Gemini)
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
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    }
  } else if (isGemini && !finalUrl.includes('chat/completions')) {
    if (!finalUrl.includes(':generateContent')) {
      finalUrl = finalUrl.replace(/\/$/, '') + `/v1beta/models/${activeProfile.model}:generateContent`
    }
    headers['x-goog-api-key'] = key
    reqBody = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }]
    }
  } else {
    headers['Authorization'] = `Bearer ${key}`
    reqBody = {
      model: activeProfile.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
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
    throw new Error(`${response.status} ${response.statusText}\n${errorText}`)
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
    throw new Error('AI 接口返回为空')
  }

  return resultText
}
