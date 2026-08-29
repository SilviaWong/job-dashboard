/**
 * 婉拒匹配与黑名单解析引擎
 */

// 婉拒判定关键词列表
export const REJECTION_KEYWORDS = [
  '不合适', '暂不匹配', '暂不考虑', '不符合', '暂不合适', '技能不符',
  '不太匹配', '不搭', '未能通过', '未通过',
  '需要本', '要求本', '必须统招', '学历不符', '要求全日制', '专业不符', '经验不符',
  '感谢关注', '很遗憾', '抱歉', '对不起', '感谢投递', '祝您早日', '祝您找到更合适',
  '招满', '招完', '已招到', '停止招聘', 'hc已满', 'HC已满', '职位已关闭', '暂无合适空缺', '岗位已停'
]

// 误判排除模式（当只匹配到这些词时，不视为婉拒）
export const EXCLUSION_PATTERNS = [
  /不是/g, /不得不/g, /如果不/g, /不见不散/g, /不知/g,
  /不限/g, /不妨/g, /不耽误/g, /不影响/g, /不仅/g, /不论/g
]

/**
 * 判断消息文本是否为 HR 婉拒信息
 */
export function isRejectionMessage(message: string): { isRejected: boolean; reason?: string; matchedKeyword?: string } {
  if (!message || typeof message !== 'string') {
    return { isRejected: false }
  }

  const cleanMsg = message.trim()
  if (cleanMsg.length === 0) return { isRejected: false }

  // 1. 检查误判排除：替换掉常见误判词
  let filteredMsg = cleanMsg
  for (const pat of EXCLUSION_PATTERNS) {
    filteredMsg = filteredMsg.replace(pat, '')
  }

  // 2. 检查婉拒关键词
  for (const kw of REJECTION_KEYWORDS) {
    if (filteredMsg.includes(kw)) {
      return {
        isRejected: true,
        reason: `沟通婉拒: ${cleanMsg.slice(0, 100)}`,
        matchedKeyword: kw
      }
    }
  }

  // 3. 特殊复合正则匹配
  if (/感谢.*但/i.test(filteredMsg) || /遗憾.*无法/i.test(filteredMsg) || /抱歉.*目前/i.test(filteredMsg)) {
    return {
      isRejected: true,
      reason: `沟通婉拒: ${cleanMsg.slice(0, 100)}`,
      matchedKeyword: '复合婉拒语式'
    }
  }

  return { isRejected: false }
}

/**
 * 清洗公司名称（移除网页省略号、前缀、异常符号）
 */
export function cleanCompanyNameForBlacklist(name: string): string {
  if (!name || typeof name !== 'string') return ''

  return name
    .replace(/[·.]{2,}/g, '') // 移除 ... 或 ···
    .replace(/^[【\[(（][^】\])）]+[】\])）]/g, '') // 移除前缀标签如【校招】
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
}

/**
 * 文本自由解析（支持从聊天记录复制的文本段落批量提取）
 */
export function parseChatTextLines(text: string): Array<{ companyName: string; message: string; reason: string }> {
  if (!text) return []

  const results: Array<{ companyName: string; message: string; reason: string }> = []
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  for (const line of lines) {
    let comp = ''
    let msg = ''

    const splitIdx = line.search(/[:：\t\-—]/)
    if (splitIdx > 0) {
      comp = line.slice(0, splitIdx).trim()
      msg = line.slice(splitIdx + 1).trim()
    } else {
      continue
    }

    const cleanComp = cleanCompanyNameForBlacklist(comp)
    if (cleanComp.length >= 2 && cleanComp.length <= 40) {
      const rej = isRejectionMessage(msg)
      if (rej.isRejected) {
        results.push({
          companyName: cleanComp,
          message: msg,
          reason: rej.reason || `沟通婉拒: ${msg.slice(0, 60)}`
        })
      }
    }
  }

  return results
}
