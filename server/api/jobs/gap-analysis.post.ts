import { getPrisma } from '#prisma'
import { callAI } from '../../utils/aiCaller'

const JD_GAP_PROMPT = `
你是一位资深技术专家和严格的招聘面试官。请对比候选人简历与目标岗位JD，进行客观、深度的技能与经验差距分析(Gap Analysis)。
请务必返回合法的 JSON 对象，不要包含 markdown 代码块包裹，也不要有任何其他文字说明。

输出 JSON 格式要求：
{
  "matchScore": 80, // 0-100的匹配度整数
  "matchLevel": "A", // "A"(85+ 极高匹配), "B"(70-84 良好匹配), "C"(55-69 部分匹配), "D"(<55 差距较大)
  "summary": "100字以内的总体契合度评估，指出核心胜任力与主要风险点",
  "matchedSkills": [
    { "skill": "技能/经验项", "detail": "简历中的契合证明与亮点说明", "level": "高度匹配" }
  ],
  "missingSkills": [
    { "skill": "缺失或薄弱技能", "detail": "JD中的具体要求与当前简历的差距", "impact": "高/中/低" }
  ],
  "interviewRisks": [
    "面试官可能会深入挑刺追问的技术点或疑点1",
    "技术点或疑点2"
  ],
  "tailoredAdvice": [
    "针对该岗位，简历具体应如何修改或突出亮点的建议1",
    "建议2",
    "建议3"
  ]
}
`

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { jobId, resumeProfileId } = body

  if (!jobId) {
    return { success: false, error: '缺少 jobId' }
  }

  const prisma = getPrisma(event)

  try {
    // 1. 获取目标职位
    const job = await prisma.job.findFirst({
      where: { jobId },
      include: {
        detailPayload: {
          select: { jobDesc: true }
        }
      }
    })

    if (!job) {
      return { success: false, error: '职位不存在' }
    }

    // 2. 获取候选人简历内容 (优先 resumeProfileId -> 默认简历 -> AiSettings)
    let resumeContent = ''
    let profileTitle = '默认简历'

    if (resumeProfileId) {
      const profile = await prisma.resumeProfile.findUnique({
        where: { id: resumeProfileId }
      })
      if (profile) {
        resumeContent = profile.content
        profileTitle = profile.title
      }
    }

    if (!resumeContent) {
      const defaultProfile = await prisma.resumeProfile.findFirst({
        where: { isDefault: true }
      })
      if (defaultProfile) {
        resumeContent = defaultProfile.content
        profileTitle = defaultProfile.title
      }
    }

    if (!resumeContent) {
      const settings = await prisma.aiSettings.findUnique({
        where: { id: 'default' }
      })
      resumeContent = settings?.resume || ''
    }

    if (!resumeContent.trim()) {
      return { success: false, error: '未找到简历内容，请先在简历管理中添加简历' }
    }

    // 3. 提取岗位描述
    let rawData = job.rawData ? JSON.parse(job.rawData) : {}
    let jobDescription = job.detailPayload?.jobDesc || ''

    if (!jobDescription) {
      const platform = (job.platform || '').toLowerCase()
      if (platform.includes('猎聘')) {
        const info = rawData.jobDetailJson || {}
        jobDescription = info.description || info.supplementalDomData?.jobDescribe || ''
      } else if (platform.includes('boss')) {
        jobDescription = rawData.jobDetail?.zpData?.jobInfo?.postDescription || ''
      } else if (platform.includes('智联')) {
        jobDescription = rawData.jobDetailData?.position?.desc?.description || rawData.jobDetail?.detailedPosition?.description || ''
      } else if (platform.includes('51job')) {
        jobDescription = rawData.jobDescribe || rawData.raw_detail_json?.detailJobInfo?.jobDescribe || ''
      }
    }

    if (!jobDescription) {
      jobDescription = rawData.jobDescription || rawData.jobDesc || job.title
    }

    const userPrompt = `
=== 目标岗位 JD ===
职位名称：${job.title}
公司名称：${job.companyName}
薪资待遇：${job.salary}
工作地点：${job.location}
岗位描述与技能要求：
${jobDescription}

=== 候选人简历 [版本: ${profileTitle}] ===
${resumeContent}
`

    // 4. 调用 AI 接口
    const aiRawResponse = await callAI(JD_GAP_PROMPT, userPrompt, event)

    // 5. 解析 JSON 响应
    let parsed: any = null
    try {
      const jsonMatch = aiRawResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        parsed = JSON.parse(aiRawResponse)
      }
    } catch (e) {
      // 容错处理
      parsed = {
        matchScore: 70,
        matchLevel: 'B',
        summary: aiRawResponse.slice(0, 200),
        matchedSkills: [],
        missingSkills: [],
        interviewRisks: [],
        tailoredAdvice: []
      }
    }

    return {
      success: true,
      data: {
        ...parsed,
        profileTitle,
        analyzedAt: new Date().toISOString()
      }
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'JD 深度对齐差距分析失败'
    }
  }
})
