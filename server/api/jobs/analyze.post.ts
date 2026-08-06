import prisma from '../../utils/prisma'

const AI_SCORING_PROMPT = `
你现在是一位严格的招聘评估专家。请对比求职者简历与职位JD，严格按照以下维度评分(0-100分)：
- 技能匹配度(25分)：核心技能完全匹配得25分，部分匹配按比例得分
- 经验相关性(25分)：工作年限符合且行业经验相关得25分，缺一项扣分
- 教育背景(20分)：学历达标得10分，专业相关得10分
- 成就与项目(20分)：有相关成功项目经验得高分，无相关项目得低分
- 软技能与文化(10分)：软技能与公司文化匹配度

无论评分结果如何，你必须列出至少3个简历与职位不匹配的地方。如果找不到明显不匹配点，也要指出潜在风险点。

###注意：一般情况下，大多数候选人应该落在60-80分区间，请谨慎给出80分以上的高分。###

评分前，请先考虑：
1. 如果是完美匹配的候选人会是什么样子？
2. 如果是完全不匹配的候选人会是什么样子？
3. 当前候选人处于哪个位置？

记住，你的目标是给出准确评分，而非鼓励应聘者。过高评分会导致求职者浪费时间申请不适合的职位。###因此你必须狠狠的给用户扣分###

在完成评分后，你需要把五项评分结果以列表形式列出：[25,25,20,20,10]

###不必输出总分###

评分后，请给出3个具体改进建议，帮助候选人提高与该职位的匹配度。这些建议必须具体明确，例如"需要学习X技术"而非"需要提升技术能力"。
 
# 输出格式要求
 1、五维岗位匹配度分数及评分理由
 2、五维评分结果列表展示：[25,25,20,20,10]
 3、3个具体改进建议
`;

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { jobId } = body

  if (!jobId) {
    return { success: false, error: '缺少 jobId' }
  }

  try {
    // 1. Fetch Job
    const job = await prisma.job.findUnique({
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
      return { success: false, error: '请先在 AI 智能配置中完成 API 配置和简历设置' }
    }

    const profiles = JSON.parse(settings.profiles)
    const activeProfile = profiles.find((p: any) => p.id === settings.activeProfileId)

    if (!activeProfile || !activeProfile.url || !activeProfile.key || !activeProfile.model) {
      return { success: false, error: '当前激活的大模型配置不完整' }
    }

    // 3. Construct Prompt
    let jobDetails = job.rawData ? JSON.parse(job.rawData) : {}
    let jobDescription = jobDetails['职位描述'] || jobDetails['jobDescription'] || ''
    
    const prompt = `
=== 职位信息 ===
职位名称：${job.title}
公司名称：${job.companyName}
岗位要求/描述：
${jobDescription}

=== 候选人简历 ===
${settings.resume}
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
        system: AI_SCORING_PROMPT,
        messages: [{ role: 'user', content: prompt }]
      }
    } else if (isGemini && !finalUrl.includes('chat/completions')) {
      if (!finalUrl.includes(':generateContent')) {
        finalUrl = finalUrl.replace(/\/$/, '') + `/v1beta/models/${activeProfile.model}:generateContent`
      }
      headers['x-goog-api-key'] = key
      reqBody = {
        systemInstruction: { parts: [{ text: AI_SCORING_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      }
    } else {
      headers['Authorization'] = `Bearer ${key}`
      reqBody = {
        model: activeProfile.model,
        messages: [
          { role: 'system', content: AI_SCORING_PROMPT },
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

    // 5. Parse Score
    let totalScore = 0;
    try {
        const scoreMatch = resultText.match(/\[([\d,\s]+)\]/);
        if (scoreMatch && scoreMatch[1]) {
            const scores = scoreMatch[1].split(',').map(s => parseInt(s.trim()));
            totalScore = scores.reduce((a, b) => a + (isNaN(b) ? 0 : b), 0);
        } else {
            // 尝试在文本中寻找 0-100 的总分
            const fallbackMatch = resultText.match(/(?:总分|综合得分|匹配度).*?(\\d{1,3})/);
            if (fallbackMatch && fallbackMatch[1]) {
                totalScore = parseInt(fallbackMatch[1]);
            }
        }
    } catch (e) {
        console.error('Parse score error:', e);
    }
    
    // 确保总分在合理区间
    totalScore = Math.max(0, Math.min(100, totalScore));

    let matchLevel = 'B';
    if (totalScore >= 80) matchLevel = 'A';
    if (totalScore < 60) matchLevel = 'C';

    // 6. Save to Prisma
    const aiResult = await prisma.aiJobResult.upsert({
      where: { jobId },
      update: {
        score: totalScore,
        matchLevel,
        resultText
      },
      create: {
        jobId,
        score: totalScore,
        matchLevel,
        resultText
      }
    })

    return { success: true, data: aiResult }

  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
