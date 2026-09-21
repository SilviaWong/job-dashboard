/**
 * 大模型响应与评分解析工具集
 * 兼容支持各大模型及各类中转聚合网关返回的差异化数据格式
 */

export interface ExtractedAiResponse {
  content: string
  thinking: string
}

export interface ParsedAiScore {
  totalScore: number
  dimensionScores: number[] | null
  matchLevel: 'A' | 'B' | 'C'
}

/**
 * 从不同大模型平台（OpenAI、Claude、Gemini、DeepSeek、Kimi、Ollama、OneAPI等中转网关）响应中提取内容与思维链
 */
export function extractAiResponse(data: any): ExtractedAiResponse {
  if (!data) return { content: '', thinking: '' }

  let content = ''
  let thinking = ''

  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      content = data
    }
  }

  if (typeof data === 'object' && data !== null) {
    // 1. 提取推理/思考链 (Thinking / Reasoning Content)
    if (typeof data.thinking === 'string') {
      thinking = data.thinking
    } else if (typeof data.reasoning === 'string') {
      thinking = data.reasoning
    } else if (typeof data.reasoning_content === 'string') {
      thinking = data.reasoning_content
    } else if (data.choices?.[0]?.message?.reasoning_content) {
      thinking = data.choices[0].message.reasoning_content
    } else if (data.choices?.[0]?.message?.thinking) {
      thinking = data.choices[0].message.thinking
    }

    // 2. 提取正文内容 (Content)
    if (typeof data.content === 'string') {
      // 直出型中转网关、反代、自定义聚合接口
      content = data.content
    } else if (Array.isArray(data.content)) {
      // Claude 原生结构或混合 block 结构
      content = data.content
        .map((c: any) => {
          if (typeof c === 'string') return c
          if (c && (c.type === 'text' || typeof c.text === 'string')) return c.text || ''
          if (c && c.type === 'thinking' && typeof c.thinking === 'string') {
            if (!thinking) thinking = c.thinking
            return ''
          }
          return ''
        })
        .filter(Boolean)
        .join('\n')
    } else if (Array.isArray(data.choices) && data.choices.length > 0) {
      // OpenAI 兼容结构
      const first = data.choices[0]
      if (typeof first.message?.content === 'string') {
        content = first.message.content
      } else if (typeof first.text === 'string') {
        content = first.text
      } else if (typeof first.delta?.content === 'string') {
        content = first.delta.content
      }
    } else if (Array.isArray(data.candidates) && data.candidates.length > 0) {
      // Gemini 结构
      const parts = data.candidates[0]?.content?.parts
      if (Array.isArray(parts)) {
        content = parts
          .map((p: any) => {
            if (p.thought) {
              if (!thinking && typeof p.text === 'string') thinking = p.text
              return ''
            }
            return p.text || ''
          })
          .filter(Boolean)
          .join('\n')
      }
    } else if (typeof data.response === 'string') {
      // Ollama 结构
      content = data.response
    } else if (typeof data.text === 'string') {
      content = data.text
    } else if (typeof data.output === 'string') {
      content = data.output
    } else if (typeof data.message === 'string') {
      content = data.message
    } else if (typeof data.message?.content === 'string') {
      content = data.message.content
    }
  }

  // 3. 处理正文中内嵌的 <think>...</think> 标签 (DeepSeek R1 / Qwen 等模型常见)
  if (content && content.includes('<think>')) {
    const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/i)
    if (thinkMatch) {
      if (!thinking) thinking = thinkMatch[1].trim()
      content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
    }
  }

  return {
    content: content.trim(),
    thinking: thinking.trim()
  }
}

/**
 * 便捷提取正文文本
 */
export function extractAiResponseText(data: any): string {
  return extractAiResponse(data).content
}

/**
 * 解析多维评分与计算综合得分
 */
export function parseAiScore(text: string): ParsedAiScore {
  if (!text) return { totalScore: 0, dimensionScores: null, matchLevel: 'C' }

  // 1. 精确匹配 5 项分数数组格式 [16, 18, 5, 17, 7]，支持各类中英文括号与分隔符
  const exact5Match = text.match(/(?:\[|【|［)\s*(\d{1,2})\s*[,，、\s]+\s*(\d{1,2})\s*[,，、\s]+\s*(\d{1,2})\s*[,，、\s]+\s*(\d{1,2})\s*[,，、\s]+\s*(\d{1,2})\s*(?:\]|】|］)/)
  if (exact5Match) {
    const scores = [exact5Match[1], exact5Match[2], exact5Match[3], exact5Match[4], exact5Match[5]].map(Number)
    const sum = scores.reduce((a, b) => a + b, 0)
    const totalScore = Math.max(0, Math.min(100, sum))
    return {
      totalScore,
      dimensionScores: scores,
      matchLevel: totalScore >= 80 ? 'A' : totalScore < 60 ? 'C' : 'B'
    }
  }

  // 2. 从每个维度的文字详情中提取得分（如：**1. 技能匹配度...得分：16分**）
  const s1 = text.match(/(?:技能匹配度|技能)[^\n\r]*?(?:得分|分数)[：:—\s]*(\d{1,2})/)
  const s2 = text.match(/(?:经验相关性|经验)[^\n\r]*?(?:得分|分数)[：:—\s]*(\d{1,2})/)
  const s3 = text.match(/(?:教育背景|学历)[^\n\r]*?(?:得分|分数)[：:—\s]*(\d{1,2})/)
  const s4 = text.match(/(?:成就与项目|项目)[^\n\r]*?(?:得分|分数)[：:—\s]*(\d{1,2})/)
  const s5 = text.match(/(?:软技能与文化|软技能)[^\n\r]*?(?:得分|分数)[：:—\s]*(\d{1,2})/)

  if (s1 && s2 && s3 && s4 && s5) {
    const scores = [s1[1], s2[1], s3[1], s4[1], s5[1]].map(Number)
    const sum = scores.reduce((a, b) => a + b, 0)
    const totalScore = Math.max(0, Math.min(100, sum))
    return {
      totalScore,
      dimensionScores: scores,
      matchLevel: totalScore >= 80 ? 'A' : totalScore < 60 ? 'C' : 'B'
    }
  }

  // 3. 通用数字数组兜底匹配（长度至少为 3，且和在 0-100 之间）
  const arrayMatch = text.match(/(?:\[|【|［)([\d,，、\s]+)(?:\]|】|］)/)
  if (arrayMatch && arrayMatch[1]) {
    const parts = arrayMatch[1].split(/[,，、\s]+/).filter(Boolean).map(s => parseInt(s.trim(), 10))
    if (parts.length >= 3) {
      const sum = parts.reduce((a, b) => a + (isNaN(b) ? 0 : b), 0)
      if (sum > 0 && sum <= 100) {
        return {
          totalScore: sum,
          dimensionScores: parts,
          matchLevel: sum >= 80 ? 'A' : sum < 60 ? 'C' : 'B'
        }
      }
    }
  }

  // 4. 文本总分关键字兜底（如：“总分：75”、“综合得分82分”）
  const totalMatch = text.match(/(?:总分|综合得分|最终得分|综合匹配度|匹配度得分|总得分)[^\d]*?(\d{1,3})\s*(?:分|\/|满分|$)/)
  if (totalMatch && totalMatch[1]) {
    const score = parseInt(totalMatch[1], 10)
    if (!isNaN(score)) {
      const totalScore = Math.max(0, Math.min(100, score))
      return {
        totalScore,
        dimensionScores: null,
        matchLevel: totalScore >= 80 ? 'A' : totalScore < 60 ? 'C' : 'B'
      }
    }
  }

  return { totalScore: 0, dimensionScores: null, matchLevel: 'C' }
}
