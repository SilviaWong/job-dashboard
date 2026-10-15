import type { AgentContext, AgentRunResult, AgentStep, AgentCard } from './types'
import { tools } from './tools'
import { resolveAiRequest } from '../utils/aiCaller'
import { extractAiResponse } from '../utils/aiResponseParser'

const MAX_STEPS = 6

/**
 * 格式化所有工具的描述供 System Prompt 使用
 */
function formatToolsDoc(): string {
  return tools.map(t => {
    return `### 工具名: ${t.name}
描述: ${t.description}
参数: ${JSON.stringify(t.parameters, null, 2)}
`
  }).join('\n')
}

/**
 * 核心系统提示词
 */
function buildSystemPrompt(): string {
  return `你是由 Job Dashboard Local 系统驱动的专业全流程求职智能体（Job Agent / 求职管家）。
你的目标是协助求职者高效完成职位检索筛选、五维契合度诊断、打招呼语生成、投递状态追踪和面试备考复盘。

你有权限调用以下本地数据库工具：
${formatToolsDoc()}

=== 交互协议规范 ===
你必须严格以合法的 JSON 格式进行回复（可以使用 \`\`\`json ... \`\`\` 包裹，也可以直接输出 JSON 对象）。

每次回复必须是以下两种结构之一：

【情况 A：你需要调用工具时】
{
  "thought": "你的思考过程，清晰解释你为什么需要调用该工具，以及预期获取什么数据",
  "tool": "工具名",
  "params": { ...对应的参数对象... }
}

【情况 B：你已经获取到足够信息，给用户提供最终答复时】
{
  "thought": "你的归纳总结与思考",
  "final_answer": "给求职者的自然语言回答。要求结构清晰、言简意赅、充满鼓励与专业洞察。支持 Markdown 语法与表格。",
  "cards": [
    // 可选：附加富交互结构化卡片，方便前端直接渲染快捷操作
    // card 的 type 支持: "job_list", "job_detail", "greeting", "funnel_summary", "batch_scan_result", "question_list"
    // 例如：
    // { "type": "job_list", "title": "推荐的高匹配职位", "data": [ ... ] }
    // { "type": "greeting", "title": "Boss直聘招呼语", "data": { "jobId": "...", "text": "..." } }
  ]
}

=== 行为原则 ===
1. 真实与严谨：不要凭空编造不存在的职位ID或公司。所有岗位数据、状态必须基于工具从本地库查询获取。
2. 目标驱动：当用户提出诸如“帮我看看有什么好岗位”、“推荐今天适合投的”、“一键巡检”等要求时，主动先查数据、再过滤、再给出针对性建议。
3. 善用卡片（cards）：当推荐职位或产出打招呼语时，在 cards 中附带结构化数据，前端会自动渲染可交互卡片（支持点击查看详情或一键复制招呼语）。
`
}

/**
 * 清理并解析 JSON
 */
function parseJsonSafe(text: string): any {
  if (!text) return null
  let cleaned = text.trim()

  // 剔除 markdown 语法代码块
  const jsonBlock = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (jsonBlock && jsonBlock[1]) {
    cleaned = jsonBlock[1].trim()
  }

  // 尝试直接解析
  try {
    return JSON.parse(cleaned)
  } catch {}

  // 寻找最外层的 { ... }
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1))
    } catch {}
  }

  return null
}

export async function runJobAgent(
  userQuery: string,
  history: Array<{ role: 'user' | 'assistant', content: string }> = [],
  context: AgentContext
): Promise<AgentRunResult> {
  const { prisma } = context

  // 1. 获取 AI 配置
  const settings = await prisma.aiSettings.findUnique({ where: { id: 'default' } })
  if (!settings || !settings.activeProfileId || !settings.profiles) {
    return {
      success: false,
      answer: '抱歉，当前系统尚未配置 AI 大模型。请先在左侧菜单「大模型管理」中配置 API Key 与模型地址。',
      steps: [],
      cards: [],
      error: 'NO_AI_CONFIG'
    }
  }

  const profiles = JSON.parse(settings.profiles || '[]')
  const activeProfile = profiles.find((p: any) => p.id === settings.activeProfileId)
  if (!activeProfile || !activeProfile.key) {
    return {
      success: false,
      answer: '当前激活的 AI 模型缺少 API Key，请检查配置。',
      steps: [],
      cards: [],
      error: 'INVALID_AI_PROFILE'
    }
  }

  const systemPrompt = buildSystemPrompt()
  const steps: AgentStep[] = []
  const cards: AgentCard[] = []

  // 组装多轮上下文
  let conversationTurns: string[] = []
  if (history && history.length > 0) {
    const recent = history.slice(-6)
    for (const h of recent) {
      conversationTurns.push(`[${h.role === 'user' ? '用户' : '助手'}]: ${h.content}`)
    }
  }
  conversationTurns.push(`[用户最新需求]: ${userQuery}`)

  let currentTurnPrompt = conversationTurns.join('\n\n')

  // 开始 ReAct 循环
  for (let stepIndex = 1; stepIndex <= MAX_STEPS; stepIndex++) {
    const { finalUrl, headers, reqBody } = resolveAiRequest(
      activeProfile,
      systemPrompt,
      currentTurnPrompt,
      2500
    )

    let responseData: any
    try {
      const response = await fetch(finalUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(reqBody)
      })

      if (!response.ok) {
        const errText = await response.text()
        return {
          success: false,
          answer: `大模型接口返回异常 (${response.status}): ${errText}`,
          steps,
          cards,
          error: errText
        }
      }

      responseData = await response.json()
    } catch (err: any) {
      return {
        success: false,
        answer: `网络调用失败: ${err.message}`,
        steps,
        cards,
        error: err.message
      }
    }

    const { content: rawText } = extractAiResponse(responseData)
    const parsed = parseJsonSafe(rawText)

    // 如果无法解析成 JSON，可能是模型直接输出了文字答案
    if (!parsed) {
      steps.push({
        step: stepIndex,
        thought: '大模型直接输出了自然语言文本回答。'
      })
      return {
        success: true,
        answer: rawText || '抱歉，未能获得有效回答。',
        steps,
        cards
      }
    }

    const thought = parsed.thought || ''
    const toolName = parsed.tool
    const toolParams = parsed.params || {}
    const finalAnswer = parsed.final_answer

    // 如果输出了 final_answer，结束循环
    if (finalAnswer) {
      steps.push({
        step: stepIndex,
        thought: thought || '已完成所有必要工具的执行，组织最终回答。'
      })

      if (Array.isArray(parsed.cards)) {
        for (const c of parsed.cards) {
          if (c && c.type && c.data) cards.push(c)
        }
      }

      return {
        success: true,
        answer: finalAnswer,
        steps,
        cards
      }
    }

    // 检查是否要执行工具
    if (toolName) {
      const targetTool = tools.find(t => t.name === toolName)
      if (!targetTool) {
        const obs = { error: `未找到名为 '${toolName}' 的工具` }
        steps.push({
          step: stepIndex,
          thought,
          toolName,
          toolParams,
          observation: obs
        })
        currentTurnPrompt += `\n\n[第 ${stepIndex} 步执行结果] 工具 '${toolName}' 不存在。可用工具列表见系统提示。请重新规划。`
        continue
      }

      // 执行工具
      let observation: any
      try {
        observation = await targetTool.execute(toolParams, context)
      } catch (execErr: any) {
        observation = { error: `执行工具 ${toolName} 时发生异常: ${execErr.message}` }
      }

      steps.push({
        step: stepIndex,
        thought,
        toolName,
        toolParams,
        observation
      })

      // 智能提取部分高价值工具结果直接加入 cards
      if (toolName === 'search_jobs' && observation?.jobs?.length > 0) {
        cards.push({
          type: 'job_list',
          title: `检索到的职位 (${observation.jobs.length} 个)`,
          data: observation.jobs
        })
      } else if (toolName === 'generate_greeting' && observation?.greeting) {
        cards.push({
          type: 'greeting',
          title: `为 ${observation.title} 生成的打招呼文案`,
          data: observation
        })
      } else if (toolName === 'get_funnel_summary' && observation?.stages) {
        cards.push({
          type: 'funnel_summary',
          title: '当前求职看板数据漏斗',
          data: observation
        })
      } else if (toolName === 'batch_filter_and_recommend' && observation?.jobs?.length > 0) {
        cards.push({
          type: 'batch_scan_result',
          title: '一键智能巡检结果',
          data: observation
        })
      }

      // 构造下一次迭代的 Observation 输入
      currentTurnPrompt += `\n\n[第 ${stepIndex} 步你调用的工具]: ${toolName}
[参数]: ${JSON.stringify(toolParams)}
[执行结果 Observation]:
${JSON.stringify(observation, null, 2)}
请根据执行结果，继续思考下一步。如果已经收集完信息，请输出 final_answer。`
    } else {
      // 既没有 tool 也没有 final_answer，兜底输出
      return {
        success: true,
        answer: thought || rawText,
        steps,
        cards
      }
    }
  }

  // 超过最大步数兜底
  return {
    success: true,
    answer: '已经执行了多轮工具检索与分析，当前为你总结已有发现。请查看执行步骤与推荐卡片。',
    steps,
    cards
  }
}
