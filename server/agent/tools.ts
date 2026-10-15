import type { AgentTool, AgentContext, AgentCard } from './types'
import { resolveAiRequest } from '../utils/aiCaller'
import { extractAiResponse, extractAiResponseText, parseAiScore } from '../utils/aiResponseParser'

const AI_SCORING_PROMPT = `
你现在是一位严格的招聘评估专家。请对比求职者简历与职位JD，严格按照以下维度评分(0-100分)：
- 技能匹配度(25分)：核心技能完全匹配得25分，部分匹配按比例得分
- 经验相关性(25分)：工作年限符合且行业经验相关得25分，缺一项扣分
- 教育背景(20分)：学历达标得10分，专业相关得10分
- 成就与项目(20分)：有相关成功项目经验得高分，无相关项目得低分
- 软技能与文化(10分)：软技能与公司文化匹配度

无论评分结果如何，你必须列出至少3个简历与职位不匹配的地方。如果找不到明显不匹配点，也要指出潜在风险点。

###注意：一般情况下，大多数候选人应该落在60-80分区间，请谨慎给出80分以上的高分。###

在完成评分后，你需要把五项评分结果以列表形式列出：[25,25,20,20,10]
###不必输出总分###

评分后，请给出3个具体改进建议，帮助候选人提高与该职位的匹配度。

# 输出格式要求
1、五维岗位匹配度分数及评分理由
2、五维评分结果列表展示：[25,25,20,20,10]
3、3个具体改进建议
`

const AI_GREETING_PROMPT = `
你现在是一位求职专家。请根据提供的【候选人简历】和【目标岗位 JD】，为候选人写一段用于 Boss直聘 等招聘软件的打招呼语/自我介绍。
要求：
1. 语言简练，直击痛点，重点突出候选人与岗位最匹配的核心优势，篇幅控制在 100-200 字左右。
2. 语气真诚、自信，表现出对岗位的强烈意愿，礼貌得体。
3. 直接输出打招呼语的正文，不需要任何多余的解释或开头语。
`

/**
 * 获取活跃的简历内容
 */
async function getResumeContent(context: AgentContext, resumeProfileId?: string): Promise<string> {
  const { prisma } = context
  if (resumeProfileId) {
    const profile = await prisma.resumeProfile.findUnique({ where: { id: resumeProfileId } })
    if (profile?.content) return profile.content
  }
  const defaultProfile = await prisma.resumeProfile.findFirst({ where: { isDefault: true } })
  if (defaultProfile?.content) return defaultProfile.content

  const settings = await prisma.aiSettings.findUnique({ where: { id: 'default' } })
  return settings?.resume || ''
}

/**
 * 获取已配置的有效大模型 Profile
 */
async function getActiveAiProfile(context: AgentContext) {
  const { prisma } = context
  const settings = await prisma.aiSettings.findUnique({ where: { id: 'default' } })
  if (!settings || !settings.activeProfileId || !settings.profiles) {
    throw new Error('系统尚未配置大模型，请在设置中完成 AI 模型配置')
  }
  const profiles = JSON.parse(settings.profiles || '[]')
  const activeProfile = profiles.find((p: any) => p.id === settings.activeProfileId)
  if (!activeProfile || !activeProfile.key) {
    throw new Error('未配置 API Key 或未找到激活的模型')
  }
  return activeProfile
}

export const tools: AgentTool[] = [
  // 1. 检索职位
  {
    name: 'search_jobs',
    description: '多条件检索本地职位库。可按关键词、城市、薪资范围、投递跟进状态(applyStatus)、最低匹配分等搜索，返回职位列表及匹配分。',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '职位名称或公司名称关键词' },
        city: { type: 'string', description: '城市名或城市代码，如 上海、杭州、北京、深圳 等' },
        minSalary: { type: 'number', description: '最低月薪(k)，如 20' },
        maxSalary: { type: 'number', description: '最高月薪(k)，如 35' },
        applyStatus: {
          type: 'string',
          description: '投递进度状态',
          enum: ['all', 'none', 'to-apply', 'applied', 'interview-1', 'interview-2', 'offer', 'rejected']
        },
        minScore: { type: 'number', description: '最低AI匹配分数（0-100）' },
        onlyDiagnosed: { type: 'boolean', description: '是否只看已有AI诊断分数的职位' },
        limit: { type: 'number', description: '返回数量上限，默认 5，最大 20' }
      }
    },
    execute: async (params, context) => {
      const { prisma } = context
      const limit = Math.min(params.limit || 5, 20)

      const where: any = {
        status: 'normal',
        isHidden: false
      }

      if (params.keyword) {
        where.OR = [
          { title: { contains: params.keyword } },
          { companyName: { contains: params.keyword } }
        ]
      }

      if (params.city && params.city !== 'all') {
        where.city = { contains: params.city }
      }

      if (params.applyStatus && params.applyStatus !== 'all') {
        where.applyStatus = params.applyStatus
      }

      if (params.minSalary !== undefined) {
        where.salaryMax = { gte: params.minSalary }
      }
      if (params.maxSalary !== undefined) {
        where.salaryMin = { lte: params.maxSalary }
      }

      const jobs = await prisma.job.findMany({
        where,
        take: limit * 2, // 适当放大以支持按 score 过滤
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          jobId: true,
          title: true,
          companyName: true,
          salary: true,
          salaryMin: true,
          salaryMax: true,
          location: true,
          city: true,
          experience: true,
          education: true,
          platform: true,
          applyStatus: true,
          hrActiveLevel: true,
          isHeadhunter: true,
          updatedAt: true
        }
      })

      // 提取 jobId 列表批量查询 AI 评分
      const jobIds = jobs.map(j => j.jobId)
      const aiResults = await prisma.aiJobResult.findMany({
        where: { jobId: { in: jobIds } },
        select: { jobId: true, score: true, matchLevel: true, intro: true }
      })
      const aiMap = new Map(aiResults.map(r => [r.jobId, r]))

      let enriched = jobs.map(j => {
        const ai = aiMap.get(j.jobId)
        return {
          ...j,
          score: ai?.score ?? null,
          matchLevel: ai?.matchLevel ?? null,
          hasIntro: !!ai?.intro
        }
      })

      if (params.onlyDiagnosed) {
        enriched = enriched.filter(j => j.score !== null)
      }

      if (params.minScore !== undefined) {
        enriched = enriched.filter(j => (j.score || 0) >= params.minScore)
      }

      // 按匹配度或更新时间排序
      enriched.sort((a, b) => (b.score || 0) - (a.score || 0))
      const resultList = enriched.slice(0, limit)

      return {
        totalFound: resultList.length,
        jobs: resultList
      }
    }
  },

  // 2. 获取职位详情
  {
    name: 'get_job_detail',
    description: '查看指定职位的详细信息，包括岗位职责描述(JD)、公司工商背景、已有AI评估分数与打招呼语、面试记录等。',
    parameters: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: '职位唯一标识符 (jobId)' }
      },
      required: ['jobId']
    },
    execute: async (params, context) => {
      const { prisma } = context
      const job = await prisma.job.findFirst({
        where: { jobId: params.jobId },
        include: {
          detailPayload: true,
          interviews: true,
          statusLogs: { orderBy: { createdAt: 'desc' }, take: 5 }
        }
      })

      if (!job) {
        return { error: `未找到 jobId 为 ${params.jobId} 的职位` }
      }

      let jobDesc = job.detailPayload?.jobDesc || ''
      if (!jobDesc && job.rawData) {
        try {
          const raw = JSON.parse(job.rawData)
          jobDesc = raw['职位描述'] || raw['jobDescription'] || ''
        } catch {}
      }

      const aiResult = await prisma.aiJobResult.findUnique({
        where: { jobId: params.jobId }
      })

      const company = await prisma.company.findFirst({
        where: { companyName: job.companyName },
        select: { industry: true, scale: true, stage: true, companyType: true, isAgency: true }
      })

      return {
        jobId: job.jobId,
        title: job.title,
        companyName: job.companyName,
        salary: job.salary,
        location: job.location,
        city: job.city,
        experience: job.experience,
        education: job.education,
        platform: job.platform,
        hrActiveStatus: job.hrActiveStatus,
        hrActiveLevel: job.hrActiveLevel,
        applyStatus: job.applyStatus,
        jobDescription: jobDesc,
        companyInfo: company,
        aiDiagnosis: aiResult ? {
          score: aiResult.score,
          matchLevel: aiResult.matchLevel,
          resultText: aiResult.resultText,
          intro: aiResult.intro
        } : null,
        interviews: job.interviews
      }
    }
  },

  // 3. 对职位进行智能诊断评估
  {
    name: 'auto_diagnose_job',
    description: '为指定职位运行五维契合度诊断（技能匹配、经验相关、教育、成就项目、软技能），生成扣分点与改进建议，并更新系统评分。',
    parameters: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: '职位唯一标识符 (jobId)' },
        resumeProfileId: { type: 'string', description: '可选：指定的简历画像 ID' },
        forceRerun: { type: 'boolean', description: '如果已有诊断是否强制重新评估，默认 false' }
      },
      required: ['jobId']
    },
    execute: async (params, context) => {
      const { prisma } = context
      const job = await prisma.job.findFirst({
        where: { jobId: params.jobId },
        include: { detailPayload: true }
      })

      if (!job) return { error: `职位 ${params.jobId} 不存在` }

      // 检查是否已有分析
      const existing = await prisma.aiJobResult.findUnique({ where: { jobId: params.jobId } })
      if (existing?.score && !params.forceRerun) {
        return {
          status: 'cached',
          jobId: job.jobId,
          title: job.title,
          companyName: job.companyName,
          score: existing.score,
          matchLevel: existing.matchLevel,
          resultText: existing.resultText
        }
      }

      // 获取简历与 JD
      const candidateResume = await getResumeContent(context, params.resumeProfileId)
      if (!candidateResume) return { error: '未找到有效简历，请先在简历管理中添加简历' }

      let jobDesc = job.detailPayload?.jobDesc || ''
      if (!jobDesc && job.rawData) {
        try {
          const raw = JSON.parse(job.rawData)
          jobDesc = raw['职位描述'] || raw['jobDescription'] || ''
        } catch {}
      }

      const activeProfile = await getActiveAiProfile(context)
      const prompt = `
=== 目标岗位 JD ===
职位名称：${job.title}
公司名称：${job.companyName}
岗位要求/描述：
${jobDesc}

=== 候选人简历 ===
${candidateResume}
`

      const { finalUrl, headers, reqBody } = resolveAiRequest(activeProfile, AI_SCORING_PROMPT, prompt, 2048)
      const response = await fetch(finalUrl, { method: 'POST', headers, body: JSON.stringify(reqBody) })
      if (!response.ok) {
        const errText = await response.text()
        return { error: `模型调用失败 (${response.status}): ${errText}` }
      }

      const data = await response.json()
      const { content: resultText, thinking } = extractAiResponse(data)
      const { totalScore, matchLevel } = parseAiScore(resultText)

      let fullResultText = resultText
      if (thinking) {
        fullResultText = `<details class="ai-thinking-block"><summary>💭 查看 AI 深度思考推理过程</summary>\n\n${thinking}\n\n</details>\n\n---\n\n${resultText}`
      }

      await prisma.aiJobResult.upsert({
        where: { jobId: job.jobId },
        update: { score: totalScore, matchLevel, resultText: fullResultText },
        create: { jobId: job.jobId, score: totalScore, matchLevel, resultText: fullResultText }
      })

      return {
        status: 'diagnosed',
        jobId: job.jobId,
        title: job.title,
        companyName: job.companyName,
        score: totalScore,
        matchLevel,
        resultText
      }
    }
  },

  // 4. 生成针对该职位的打招呼文案
  {
    name: 'generate_greeting',
    description: '为指定职位一键定制生成直击 HR 痛点的打招呼语/自我介绍文案，并自动保存到系统中。',
    parameters: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: '职位唯一标识符 (jobId)' },
        resumeProfileId: { type: 'string', description: '可选：指定的简历画像 ID' }
      },
      required: ['jobId']
    },
    execute: async (params, context) => {
      const { prisma } = context
      const job = await prisma.job.findFirst({
        where: { jobId: params.jobId },
        include: { detailPayload: true }
      })
      if (!job) return { error: `职位 ${params.jobId} 不存在` }

      const candidateResume = await getResumeContent(context, params.resumeProfileId)
      if (!candidateResume) return { error: '未找到有效简历，请先添加简历' }

      let jobDesc = job.detailPayload?.jobDesc || ''
      if (!jobDesc && job.rawData) {
        try {
          const raw = JSON.parse(job.rawData)
          jobDesc = raw['职位描述'] || raw['jobDescription'] || ''
        } catch {}
      }

      const activeProfile = await getActiveAiProfile(context)
      const prompt = `
=== 目标岗位 JD ===
职位名称：${job.title}
公司名称：${job.companyName}
岗位职责与要求：
${jobDesc}

=== 候选人简历 ===
${candidateResume}

请生成打招呼语/自我介绍：
`
      const { finalUrl, headers, reqBody } = resolveAiRequest(activeProfile, AI_GREETING_PROMPT, prompt, 1024)
      const response = await fetch(finalUrl, { method: 'POST', headers, body: JSON.stringify(reqBody) })
      if (!response.ok) {
        const errText = await response.text()
        return { error: `模型调用失败 (${response.status}): ${errText}` }
      }

      const data = await response.json()
      const greeting = extractAiResponseText(data).trim()

      await prisma.aiJobResult.upsert({
        where: { jobId: job.jobId },
        update: { intro: greeting },
        create: { jobId: job.jobId, intro: greeting }
      })

      return {
        jobId: job.jobId,
        title: job.title,
        companyName: job.companyName,
        greeting
      }
    }
  },

  // 5. 更新职位的求职状态（看板流转）
  {
    name: 'update_job_status',
    description: '更新目标职位的投递跟踪状态（如标记为待投递、已投递、约面试等），并自动记录流转日志。',
    parameters: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: '职位唯一标识符 (jobId)' },
        toStatus: {
          type: 'string',
          description: '目标状态',
          enum: ['none', 'to-apply', 'applied', 'interview-1', 'interview-2', 'offer', 'rejected']
        },
        note: { type: 'string', description: '流转备注原因' }
      },
      required: ['jobId', 'toStatus']
    },
    execute: async (params, context) => {
      const { prisma } = context
      const job = await prisma.job.findFirst({ where: { jobId: params.jobId } })
      if (!job) return { error: `职位 ${params.jobId} 不存在` }

      const fromStatus = job.applyStatus || 'none'
      const now = new Date()

      await prisma.job.update({
        where: { id: job.id },
        data: {
          applyStatus: params.toStatus,
          statusUpdatedAt: now,
          ...(params.toStatus === 'applied' && !job.appliedAt ? { appliedAt: now } : {})
        }
      })

      await prisma.jobStatusLog.create({
        data: {
          jobRecordId: job.id,
          fromStatus,
          toStatus: params.toStatus,
          note: params.note || '由求职智能体 (Job Agent) 自动流转'
        }
      })

      return {
        success: true,
        jobId: job.jobId,
        title: job.title,
        companyName: job.companyName,
        fromStatus,
        toStatus: params.toStatus
      }
    }
  },

  // 6. 批量初筛与智能巡检
  {
    name: 'batch_filter_and_recommend',
    description: '一键自动化智能巡检：扫描当前未处理岗位，自动过滤黑名单公司、外包中介与30天未上线僵尸岗，对合格岗位进行匹配度排名，并可选自动移入待投递列表。',
    parameters: {
      type: 'object',
      properties: {
        scanCount: { type: 'number', description: '本次巡检扫描的最大岗位数，默认 10，最大 20' },
        minScore: { type: 'number', description: '推荐阈值分数，默认 75' },
        autoMoveToApply: { type: 'boolean', description: '是否将高于阈值的岗位自动设为待投递(to-apply)，默认 false' }
      }
    },
    execute: async (params, context) => {
      const { prisma } = context
      const scanCount = Math.min(params.scanCount || 10, 20)
      const minScore = params.minScore || 75
      const autoMove = !!params.autoMoveToApply

      // 查询黑名单公司
      const blacklisted = await prisma.blacklistedCompany.findMany({ select: { companyName: true } })
      const blackSet = new Set(blacklisted.map(b => b.companyName))

      // 查询未分析或状态为 none 的职位
      const candidates = await prisma.job.findMany({
        where: {
          status: 'normal',
          isHidden: false,
          applyStatus: 'none'
        },
        take: scanCount * 2,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          jobId: true,
          title: true,
          companyName: true,
          salary: true,
          location: true,
          city: true,
          hrActiveLevel: true,
          isHeadhunter: true,
          rawData: true
        }
      })

      let zombieCount = 0
      let blacklistCount = 0
      let agencyCount = 0
      const validJobs: typeof candidates = []

      for (const job of candidates) {
        if (blackSet.has(job.companyName)) {
          blacklistCount++
          continue
        }
        if (job.isHeadhunter) {
          agencyCount++
          continue
        }
        if (job.hrActiveLevel === 'zombie') {
          zombieCount++
          continue
        }
        validJobs.push(job)
        if (validJobs.length >= scanCount) break
      }

      // 获取已有或运行打分
      const results: any[] = []
      for (const job of validJobs) {
        const ai = await prisma.aiJobResult.findUnique({ where: { jobId: job.jobId } })
        let score = ai?.score
        let matchLevel = ai?.matchLevel

        // 如果未诊断，自动进行轻量评估/标记
        if (score === null || score === undefined) {
          // 记录待评估
          score = null
        }

        const isRecommended = (score !== null && score !== undefined) ? score >= minScore : false

        if (isRecommended && autoMove) {
          await prisma.job.update({
            where: { id: job.id },
            data: { applyStatus: 'to-apply', statusUpdatedAt: new Date() }
          })
          await prisma.jobStatusLog.create({
            data: {
              jobRecordId: job.id,
              fromStatus: 'none',
              toStatus: 'to-apply',
              note: `智能巡检自动推荐 (匹配分: ${score})`
            }
          })
        }

        results.push({
          jobId: job.jobId,
          title: job.title,
          companyName: job.companyName,
          salary: job.salary,
          location: job.location,
          score,
          matchLevel,
          isRecommended,
          movedToApply: isRecommended && autoMove
        })
      }

      return {
        scanned: candidates.length,
        filteredOut: {
          zombieHr: zombieCount,
          blacklisted: blacklistCount,
          agencyOrHeadhunter: agencyCount
        },
        retainedCount: validJobs.length,
        recommendedCount: results.filter(r => r.isRecommended).length,
        jobs: results
      }
    }
  },

  // 7. 求职漏斗与态势概览
  {
    name: 'get_funnel_summary',
    description: '获取当前求职看板的整体漏斗统计数据，包括总岗位数、各状态分布（待投递、已投递、约面试、已拿Offer）、AI诊断覆盖率等。',
    parameters: {
      type: 'object',
      properties: {}
    },
    execute: async (_params, context) => {
      const { prisma } = context

      const [totalJobs, diagnosedCount, statusGroups, activeInterviewCount] = await Promise.all([
        prisma.job.count({ where: { isHidden: false } }),
        prisma.aiJobResult.count(),
        prisma.job.groupBy({
          by: ['applyStatus'],
          where: { isHidden: false },
          _count: { id: true }
        }),
        prisma.interview.count()
      ])

      const statusMap: Record<string, number> = {
        'none': 0,
        'to-apply': 0,
        'applied': 0,
        'interview-1': 0,
        'interview-2': 0,
        'offer': 0,
        'rejected': 0
      }

      for (const g of statusGroups) {
        if (g.applyStatus && g.applyStatus in statusMap) {
          statusMap[g.applyStatus] = g._count.id
        }
      }

      return {
        totalJobs,
        diagnosedCount,
        diagnosedRatio: totalJobs > 0 ? Math.round((diagnosedCount / totalJobs) * 100) + '%' : '0%',
        stages: {
          '待筛选 (none)': statusMap['none'],
          '待投递 (to-apply)': statusMap['to-apply'],
          '已投递 (applied)': statusMap['applied'],
          '一面中 (interview-1)': statusMap['interview-1'],
          '二面/多面中 (interview-2)': statusMap['interview-2'],
          '已获Offer (offer)': statusMap['offer'],
          '不合适/已拒绝 (rejected)': statusMap['rejected']
        },
        activeInterviews: activeInterviewCount
      }
    }
  },

  // 8. 检索面试题库
  {
    name: 'search_interview_questions',
    description: '在系统的标准题库和变体题库中检索与指定技能、框架或技术点相关的真题及AI标准答案。',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '检索关键词，如 Vue、React、分布式、JVM、Redis 等' },
        limit: { type: 'number', description: '返回题目数量上限，默认 5' }
      },
      required: ['keyword']
    },
    execute: async (params, context) => {
      const { prisma } = context
      const limit = params.limit || 5

      const questions = await prisma.standardQuestion.findMany({
        where: {
          OR: [
            { title: { contains: params.keyword } },
            { domain: { contains: params.keyword } },
            { categoryTags: { contains: params.keyword } },
            { corePoints: { contains: params.keyword } }
          ]
        },
        include: { variants: true },
        take: limit
      })

      return {
        keyword: params.keyword,
        count: questions.length,
        questions: questions.map(q => ({
          id: q.id,
          title: q.title,
          domain: q.domain,
          corePoints: q.corePoints,
          answerKey: q.answerKey,
          aiAnswer: q.aiAnswer,
          variants: q.variants.map(v => v.title)
        }))
      }
    }
  },

  // 9. 获取当前简历画像列表
  {
    name: 'get_my_resumes',
    description: '获取求职者在系统中维护的所有简历画像（ResumeProfile），了解其当前擅长的技术栈和求职目标。',
    parameters: {
      type: 'object',
      properties: {}
    },
    execute: async (_params, context) => {
      const { prisma } = context
      const profiles = await prisma.resumeProfile.findMany({
        orderBy: { isDefault: 'desc' },
        select: {
          id: true,
          title: true,
          targetRole: true,
          tags: true,
          isDefault: true,
          content: true,
          updatedAt: true
        }
      })

      return {
        count: profiles.length,
        profiles: profiles.map(p => ({
          id: p.id,
          title: p.title,
          targetRole: p.targetRole,
          isDefault: p.isDefault,
          summaryExcerpt: p.content.slice(0, 300) + (p.content.length > 300 ? '...' : '')
        }))
      }
    }
  }
]
