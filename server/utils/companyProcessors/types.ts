import { PrismaClient } from '@prisma/client'

export type CompanyProcessor = (company: any, platform: string, prisma: PrismaClient) => Promise<void>

/**
 * 规范化公司名称与公司全称：
 * 1. 处理 Unicode 转义（如 \uXXXX）与 URL 编码；
 * 2. 将中文括号（‘（’、‘）’）替换为英文括号（‘(’、‘)’）；
 * 3. 去除所有空格。
 */
export function cleanCompanyName(str: any): string {
  if (!str) return ''
  if (typeof str === 'object') {
    str = str.name ?? str.companyName ?? str.text ?? str.title ?? ''
    if (!str) return ''
  }
  let res = String(str)
  if (res.includes('\\u') || res.includes('\\U')) {
    try {
      res = res.replace(/\\u([0-9a-fA-F]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    } catch (e) {
      try {
        res = JSON.parse(`"${res.replace(/"/g, '\\"')}"`)
      } catch (err) {}
    }
  }
  if (res.includes('%')) {
    try {
      res = decodeURIComponent(res)
    } catch (e) {}
  }
  return res
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/\s+/g, '')
    .trim()
}

/**
 * 安全地从多个候选值中提取首个非空字符串
 * 兼容 string、number、array（拼接为'/'或取非空）以及嵌套对象（如 { name, text, label, value, title, url }）
 */
export function pickString(...candidates: any[]): string {
  for (const c of candidates) {
    if (c == null) continue
    if (typeof c === 'string') {
      const trimmed = c.trim()
      if (trimmed) return trimmed
    } else if (typeof c === 'number') {
      const str = String(c).trim()
      if (str) return str
    } else if (Array.isArray(c)) {
      const items = c
        .map((item: any) => {
          if (typeof item === 'string') return item.trim()
          if (typeof item === 'number') return String(item).trim()
          if (item && typeof item === 'object') {
            const val = item.name ?? item.text ?? item.label ?? item.value ?? item.title ?? item.url ?? ''
            return String(val).trim()
          }
          return ''
        })
        .filter(Boolean)
      if (items.length > 0) return items.join('/')
    } else if (typeof c === 'object') {
      const val = c.name ?? c.text ?? c.label ?? c.value ?? c.title ?? c.url ?? c.avatar ?? c.icon ?? ''
      if (typeof val === 'string' && val.trim()) return val.trim()
      if (typeof val === 'number') return String(val).trim()
    }
  }
  return ''
}

/**
 * 从原始 JSON 对象中提取结构化企业字段 (支持 raw 列表、raw2 主页、raw3 详情页三源合流)
 */
export function extractCompanyMetadata(raw: any, raw2?: any, raw3?: any) {
  const r = raw || {}
  const r2 = raw2 || {}
  const r3 = raw3 || {}

  // 提取行业：优先取中文文本名称，严格过滤 0 及纯数字分类代码（如 Boss 直聘内部数字 code）
  const rawIndustry = pickString(
    r.brandIndustry, r['公司行业'], r.brandComInfo?.industryName, r.compIndustry, r.companyIndustry, r.industryName, r.industryTypeString,
    r2.brandIndustry, r2.industry, r2.compIndustry, r2.companyIndustry, r2['公司行业'], r2.brandComInfo?.industryName, r2.industryName, r2.industryTypeString,
    r3.brandIndustry, r3['公司行业'], r3.brandComInfo?.industryName, r3.compIndustry, r3.companyIndustry, r3.industryName, r3.industryTypeString
  )
  const industry = (rawIndustry && !/^\d+$/.test(rawIndustry.trim())) ? rawIndustry.trim() : null

  const scale = pickString(
    r.compScale, r.companyScale, r.companySize, r.companySizeString, r.sizeName, r.brandScaleName, r['公司规模'], r.brandComInfo?.scaleName,
    r2.compScale, r2.companyScale, r2.companySize, r2.companySizeString, r2.sizeName, r2.brandScaleName, r2['公司规模'], r2.brandComInfo?.scaleName,
    r3.compScale, r3.companyScale, r3.companySize, r3.companySizeString, r3.sizeName, r3.brandScaleName, r3['公司规模'], r3.brandComInfo?.scaleName
  )

  const stage = pickString(
    r.compStage, r.companyStage, r.brandStageName, r.stageName, r.stage, r['融资阶段'], r.brandComInfo?.stageName,
    r2.compStage, r2.companyStage, r2.brandStageName, r2.stageName, r2.stage, r2['融资阶段'], r2.brandComInfo?.stageName,
    r3.compStage, r3.companyStage, r3.brandStageName, r3.stageName, r3.stage, r3['融资阶段'], r3.brandComInfo?.stageName
  )

  const companyType = pickString(
    r.compKindName, r.companyType, r.companyTypeString, r.property, r['企业类型'],
    r2.compKindName, r2.companyType, r2.companyTypeString, r2.property, r2['企业类型'],
    r3.compKindName, r3.companyType, r3.companyTypeString, r3.property, r3['企业类型']
  )

  const logo = pickString(
    r.compLogo, r.companyLogo, r.logo, r.brandLogo,
    r2.compLogo, r2.companyLogo, r2.logo, r2.brandLogo,
    r3.compLogo, r3.companyLogo, r3.logo, r3.brandLogo
  )

  let creditCode = pickString(
    r.creditCode, r.unifiedSocialCreditCode, r.creditNo, r.taxNumber, r.licenseNumber, r.businessLicenseCode, r['统一社会信用代码'],
    r2.creditCode, r2.unifiedSocialCreditCode, r2.creditNo, r2.taxNumber, r2.licenseNumber, r2.businessLicenseCode, r2['统一社会信用代码'],
    r3.creditCode, r3.unifiedSocialCreditCode, r3.creditNo, r3.taxNumber, r3.licenseNumber, r3.businessLicenseCode, r3['统一社会信用代码']
  )

  // 自适应提取 18 位统一社会信用代码 (包含在执照/工商信息对象中)
  if (!creditCode) {
    const licSource = r.businessLicense || r2.businessLicense || r3.businessLicense ||
                      r.license || r2.license || r3.license ||
                      r.businessInformation || r2.businessInformation || r3.businessInformation ||
                      r.companyExtDetail || r2.companyExtDetail || r3.companyExtDetail ||
                      r.raw_company_json || r2.raw_company_json || r3.raw_company_json
    if (licSource) {
      try {
        const licStr = typeof licSource === 'string' ? licSource : JSON.stringify(licSource)
        const m = licStr.match(/[0-9A-HJ-NPQRTUWXY]{2}\d{6}[0-9A-HJ-NPQRTUWXY]{10}/i)
        if (m) creditCode = m[0]
      } catch {}
    }
  }

  const tags = r.compTags || r.welfareList || r.labels || r['公司福利'] ||
               r2.compTags || r2.welfareList || r2.labels || r2['公司福利'] ||
               r3.compTags || r3.welfareList || r3.labels || r3['公司福利']
  let welfareList: string | null = null
  const formatTagItem = (t: any): string => {
    if (typeof t === 'string') return t.trim()
    if (typeof t === 'number') return String(t).trim()
    if (t && typeof t === 'object') {
      const val = t.name ?? t.text ?? t.label ?? t.value ?? t.title ?? ''
      return String(val).trim()
    }
    return ''
  }

  if (Array.isArray(tags)) {
    const list = tags.map(formatTagItem).filter(Boolean)
    if (list.length > 0) welfareList = JSON.stringify(list)
  } else if (typeof tags === 'string' && tags.trim()) {
    try {
      const parsed = JSON.parse(tags)
      if (Array.isArray(parsed)) {
        const list = parsed.map(formatTagItem).filter(Boolean)
        if (list.length > 0) welfareList = JSON.stringify(list)
      }
    } catch {
      welfareList = JSON.stringify(tags.split(',').map((s: string) => s.trim()).filter(Boolean))
    }
  }

  return {
    industry: industry || null,
    scale: scale || null,
    stage: stage || null,
    companyType: companyType || null,
    creditCode: creditCode || null,
    logo: logo || null,
    welfareList
  }
}

export interface DetailCompanyInput {
  companyName: string
  companyFullName?: string | null
  companyId?: string | null
  platform: string
  detailRaw: any
}

/**
 * 从可能混杂了职位详情的大对象中，提炼出纯净的企业卡片原始对象（剔除职位、JD、HR等无关数据）
 */
export function extractCleanCompanyCard(raw: any, platform: string): any {
  if (!raw || typeof raw !== 'object') return {}

  // 1. 如果已显式挂载了独立的 companyCard 或 companyData，优先采用
  let baseCard = raw
  if (raw.companyCard && typeof raw.companyCard === 'object' && Object.keys(raw.companyCard).length > 0) {
    baseCard = raw.companyCard
  } else if (raw.companyData && typeof raw.companyData === 'object' && Object.keys(raw.companyData).length > 0) {
    baseCard = raw.companyData
  }

  // 2. 职位专属字段黑名单（坚决排除在企业卡片之外）
  const jobBlacklistKeys = new Set([
    '职位ID', '职位名称', '招聘状态', '薪资待遇', '工作地点', '工作经验',
    '学历要求', '职位描述', '技能标签', 'HR姓名', 'HR职位', 'HR活跃度',
    'HR_ID', 'HR标签', 'HR所属公司', '岗位类型_外包猎头', 'jobKind',
    '页面更新时间', '最后刷新时间', '精确更新时间',
    'jobId', 'encryptJobId', 'jobTitle', 'title', 'salary', 'salaryDesc',
    'jobDesc', 'jobDescribe', 'city', 'district', 'experience', 'education',
    'skills', 'tags', 'hrName', 'hrTitle', 'hrActive', 'hrActiveText',
    'isHrActive', 'url', 'detailUrl', 'raw_detail_json', 'jobDeliverList',
    'pageConfig', 'traceId', 'jobDetail', 'companyCard', 'companyData'
  ])

  const cleanCard: Record<string, any> = {}
  for (const [key, value] of Object.entries(baseCard)) {
    if (!jobBlacklistKeys.has(key)) {
      cleanCard[key] = value
    }
  }

  // 补齐平台与数据来源标识
  if (!cleanCard['平台'] && !cleanCard.platform) {
    cleanCard['平台'] = platform
    cleanCard.platform = platform
  }
  if (!cleanCard['数据来源'] && !cleanCard.dataSource) {
    cleanCard['数据来源'] = `${platform.toLowerCase()}_detail_company_card`
    cleanCard.dataSource = `${platform.toLowerCase()}_detail_company_card`
  }

  return cleanCard
}

/**
 * 将职位详情页抓取到的附带企业工商数据，可靠写入 Company 表的 rawData3，并增量补齐一等公民结构化字段
 */
export async function upsertCompanyFromDetail(prisma: any, input: DetailCompanyInput) {
  const { companyName, companyFullName, companyId, platform, detailRaw } = input
  const cleanName = cleanCompanyName(companyName || '')
  const cleanFullName = cleanCompanyName(companyFullName || '')
  const pureCompanyCard = extractCleanCompanyCard(detailRaw, platform)
  const stringifiedData = JSON.stringify(pureCompanyCard)
  const updatedAt = new Date()

  if (!cleanName && !companyId && !cleanFullName) return

  // 1. 多策略查找已有企业：优先公司ID，次选公司全称，再次简称
  let existingCompany = null
  if (companyId) {
    existingCompany = await prisma.company.findFirst({
      where: { companyId: String(companyId), sourcePlatform: platform }
    })
  }
  if (!existingCompany && cleanFullName) {
    existingCompany = await prisma.company.findFirst({
      where: { companyFullName: cleanFullName, sourcePlatform: platform }
    })
  }
  if (!existingCompany && cleanName) {
    existingCompany = await prisma.company.findFirst({
      where: { companyName: cleanName, sourcePlatform: platform }
    })
  }

  const meta = extractCompanyMetadata(null, null, pureCompanyCard)

  if (existingCompany) {
    // 2. 更新已有企业：存入 rawData3，同时如果原本的结构化字段为空，智能补全
    await prisma.company.update({
      where: { id: existingCompany.id },
      data: {
        rawData3: stringifiedData,
        updatedAt: updatedAt,
        ...(cleanFullName && !existingCompany.companyFullName ? { companyFullName: cleanFullName } : {}),
        ...(companyId && !existingCompany.companyId ? { companyId: String(companyId) } : {}),
        ...(meta.industry && !existingCompany.industry ? { industry: meta.industry } : {}),
        ...(meta.scale && !existingCompany.scale ? { scale: meta.scale } : {}),
        ...(meta.stage && !existingCompany.stage ? { stage: meta.stage } : {}),
        ...(meta.companyType && !existingCompany.companyType ? { companyType: meta.companyType } : {}),
        ...(meta.creditCode && !existingCompany.creditCode ? { creditCode: meta.creditCode } : {}),
        ...(meta.logo && !existingCompany.logo ? { logo: meta.logo } : {}),
        ...(meta.welfareList && !existingCompany.welfareList ? { welfareList: meta.welfareList } : {})
      }
    })
  } else {
    // 3. 创建新企业：以详情页为第一入口建立档案
    try {
      await prisma.company.create({
        data: {
          companyName: cleanName || cleanFullName,
          companyFullName: cleanFullName || null,
          companyId: companyId ? String(companyId) : null,
          sourcePlatform: platform,
          rawData3: stringifiedData,
          industry: meta.industry || null,
          scale: meta.scale || null,
          stage: meta.stage || null,
          companyType: meta.companyType || null,
          creditCode: meta.creditCode || null,
          logo: meta.logo || null,
          welfareList: meta.welfareList || null
        }
      })
    } catch (err: any) {
      if (err.code === 'P2002') {
        const retryComp = await prisma.company.findFirst({
          where: { companyName: cleanName || cleanFullName, sourcePlatform: platform }
        })
        if (retryComp) {
          await prisma.company.update({
            where: { id: retryComp.id },
            data: {
              rawData3: stringifiedData,
              updatedAt: updatedAt,
              ...(cleanFullName && !retryComp.companyFullName ? { companyFullName: cleanFullName } : {}),
              ...(companyId && !retryComp.companyId ? { companyId: String(companyId) } : {})
            }
          })
        }
      } else {
        console.error('[upsertCompanyFromDetail] 创建公司异常:', err)
      }
    }
  }
}
