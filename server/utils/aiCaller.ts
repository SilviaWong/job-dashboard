import { getPrisma } from '#prisma'
import { extractAiResponseText } from './aiResponseParser'

export type AiRequestMode = 'openai' | 'gemini' | 'claude' | 'auto'

export interface AiProfileConfig {
  id?: string
  name?: string
  url: string
  model: string
  key: string
  mode?: AiRequestMode
}

export interface ResolvedAiRequest {
  finalUrl: string
  headers: Record<string, string>
  reqBody: any
  resolvedMode: 'openai' | 'gemini' | 'claude'
}

/**
 * 根据 Profile 配置中选定的请求模式（mode）或自动探测，解析出目标请求 URL、Headers 与 Request Body
 */
export function resolveAiRequest(
  profile: AiProfileConfig,
  systemPrompt: string,
  userPrompt: string,
  maxTokens?: number
): ResolvedAiRequest {
  let finalUrl = (profile.url || '').trim()
  const key = profile.key || ''
  const model = profile.model || ''
  const mode = profile.mode || 'auto'

  let resolvedMode: 'openai' | 'gemini' | 'claude' = 'openai'
  if (mode === 'gemini') {
    resolvedMode = 'gemini'
  } else if (mode === 'claude') {
    resolvedMode = 'claude'
  } else if (mode === 'openai') {
    resolvedMode = 'openai'
  } else {
    // 兼容历史老配置无 mode 字段的情况：根据 model 和 url 智能回退
    const isClaude = model.toLowerCase().includes('claude') || finalUrl.includes('anthropic')
    const isGemini = !isClaude && model.toLowerCase().includes('gemini')
    if (isClaude && !finalUrl.includes('chat/completions')) {
      resolvedMode = 'claude'
    } else if (isGemini && !finalUrl.includes('chat/completions')) {
      resolvedMode = 'gemini'
    } else {
      resolvedMode = 'openai'
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  let reqBody: any = {}

  if (resolvedMode === 'claude') {
    // Anthropic Claude 原生格式
    if (!finalUrl.includes('/messages') && !finalUrl.includes('chat/completions')) {
      finalUrl = finalUrl.replace(/\/$/, '').replace(/\/v1$/, '') + '/v1/messages'
    }
    headers['x-api-key'] = key
    headers['anthropic-version'] = '2023-06-01'
    reqBody = {
      model,
      max_tokens: maxTokens || 2048,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: [{ role: 'user', content: userPrompt }]
    }
  } else if (resolvedMode === 'gemini') {
    // Google Gemini 原生格式
    if (!finalUrl.includes(':generateContent') && !finalUrl.includes('chat/completions')) {
      finalUrl = finalUrl.replace(/\/$/, '') + `/v1beta/models/${model}:generateContent`
    }
    headers['x-goog-api-key'] = key
    reqBody = {
      ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }]
    }
  } else {
    // OpenAI 兼容格式 (对标标准 OpenAI SDK base_url 解析逻辑)
    // 1. 若误带了 /responses 等后缀，予以自动剔除
    finalUrl = finalUrl.replace(/\/responses\/?$/, '')

    // 2. 补齐端点
    if (!finalUrl.includes('/chat/completions')) {
      finalUrl = finalUrl.replace(/\/+$/, '')
      // 若未带 /v1 等版本前缀，自动补充 /v1
      if (!/\/v\d+(\/.*)?$/.test(finalUrl)) {
        finalUrl = `${finalUrl}/v1`
      }
      finalUrl = `${finalUrl}/chat/completions`
    }
    headers['Authorization'] = `Bearer ${key}`
    const messages: any[] = []
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }
    messages.push({ role: 'user', content: userPrompt })
    reqBody = {
      model,
      messages,
      stream: false,
      ...(maxTokens ? { max_tokens: maxTokens } : {})
    }
  }

  return { finalUrl, headers, reqBody, resolvedMode }
}

export async function callAI(systemPrompt: string, userPrompt: string, event: any) {
  const prisma = getPrisma(event)
  
  // 1. Fetch AI Settings
  const settings = await prisma.aiSettings.findUnique({
    where: { id: 'default' }
  })

  if (!settings) {
    throw new Error('AI 配置未初始化，请先在设置中配置大模型')
  }

  const profiles = JSON.parse(settings.profiles || '[]')
  const activeProfile = profiles.find((p: any) => p.id === settings.activeProfileId)

  if (!activeProfile || !activeProfile.key) {
    throw new Error('未配置 API Key 或未选择激活的模型')
  }

  // 2. Resolve request params based on mode
  const { finalUrl, headers, reqBody } = resolveAiRequest(activeProfile, systemPrompt, userPrompt)

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
  const resultText = extractAiResponseText(data)

  if (!resultText) {
    throw new Error('AI 接口返回为空')
  }

  return resultText
}
