export interface AISkill {
  id: string
  name: string
  description: string
  generatePrompt: (jdText: string, resumeText: string) => { systemPrompt: string; userPrompt: string }
}

export const SKILL_REGISTRY: AISkill[] = [
  {
    id: 'cover-letter',
    name: '打招呼开场白',
    description: '生成针对该岗位的 Boss 直聘打招呼开场白（50字内）',
    generatePrompt: (jdText, resumeText) => ({
      systemPrompt: '你是一个专业的求职助手。请根据下方提供的【职位描述】和【我的简历】，生成一段100字以内的 Boss直聘 开场白。要求：突出我和岗位的核心匹配点，态度自信且简练，不要说多余的废话。',
      userPrompt: `【职位描述】:\n${jdText}\n\n【我的简历】:\n${resumeText}`
    })
  },
  {
    id: 'resume-match',
    name: '诊断匹配度',
    description: '分析当前职位与简历的匹配情况及劣势',
    generatePrompt: (jdText, resumeText) => ({
      systemPrompt: '你是一位资深技术面试官与HR。请根据【职位要求】与用户的【简历】，给出一个匹配度评分（百分制），并列出3个最核心的匹配优势，以及2-3个明显的经验缺失或劣势。',
      userPrompt: `【职位要求】:\n${jdText}\n\n【我的简历】:\n${resumeText}`
    })
  },
  {
    id: 'interview-prep',
    name: '预测面试题',
    description: '预测该岗位可能提问的3-5个硬核面试题',
    generatePrompt: (jdText, resumeText) => ({
      systemPrompt: '你是一位严厉的资深技术面试官。请阅读下方的【职位要求】和【候选人简历】。预测你会向该候选人提问的 3 到 5 个最具深度的面试问题。问题应直击 JD 的核心要求以及简历中可能被深挖的薄弱点。直接输出问题，无需提供答案。',
      userPrompt: `【职位要求】:\n${jdText}\n\n【我的简历】:\n${resumeText}`
    })
  }
]
