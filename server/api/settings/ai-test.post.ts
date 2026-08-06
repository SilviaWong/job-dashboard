export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { url, key, model } = body
  
  if (!url || !key || !model) {
    return { success: false, error: '请提供完整的 URL, Key 和 Model' }
  }

  try {
    let finalUrl = url.trim();
    const isClaude = model.toLowerCase().includes('claude') || finalUrl.includes('anthropic');
    const isGemini = model.toLowerCase().includes('gemini');
    
    let headers: any = {
        'Content-Type': 'application/json'
    };
    let reqBody: any = {};

    if (isClaude && !finalUrl.includes('chat/completions')) {
        headers['x-api-key'] = key;
        headers['anthropic-version'] = '2023-06-01';
        reqBody = {
            model: model,
            max_tokens: 10,
            messages: [{ role: 'user', content: '测试连接' }]
        };
    } else if (isGemini && !finalUrl.includes('chat/completions')) {
        if (!finalUrl.includes(':generateContent')) {
            finalUrl = finalUrl.replace(/\/$/, '') + `/v1beta/models/${model}:generateContent`;
        }
        headers['x-goog-api-key'] = key;
        reqBody = {
            contents: [{ role: 'user', parts: [{ text: '测试连接' }] }]
        };
    } else {
        headers['Authorization'] = `Bearer ${key}`;
        reqBody = {
            model: model,
            messages: [{ role: 'user', content: '测试连接' }],
            max_tokens: 10
        };
    }

    const response = await fetch(finalUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(reqBody)
    });

    if (response.ok) {
        return { success: true }
    } else {
        const errorText = await response.text();
        return { success: false, error: `${response.status} ${response.statusText}\n${errorText}` }
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
