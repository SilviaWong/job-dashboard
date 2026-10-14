import { resolveAiRequest } from '../../utils/aiCaller'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { url, key, model, mode } = body
  
  if (!url || !key || !model) {
    return { success: false, error: '请提供完整的 URL, Key 和 Model' }
  }

  try {
    const { finalUrl, headers, reqBody, resolvedMode } = resolveAiRequest(
      { url, key, model, mode },
      'You are a helpful assistant.',
      '测试连接',
      10
    )

    const response = await fetch(finalUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(reqBody)
    })

    if (response.ok) {
      return { success: true, mode: resolvedMode }
    } else {
      const errorText = await response.text()
      return { success: false, error: `${response.status} ${response.statusText}\n${errorText}` }
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
