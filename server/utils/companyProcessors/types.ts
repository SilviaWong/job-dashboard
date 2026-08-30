import { PrismaClient } from '@prisma/client'

export type CompanyProcessor = (company: any, platform: string, prisma: PrismaClient) => Promise<void>

/**
 * 规范化公司名称与公司全称：
 * 1. 处理 Unicode 转义（如 \uXXXX）与 URL 编码；
 * 2. 将中文括号（‘（’、‘）’）替换为英文括号（‘(’、‘)’）；
 * 3. 去除所有空格。
 */
export function cleanCompanyName(str: string): string {
  if (!str) return ''
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
 * 从原始 JSON 对象中提取结构化企业字段
 */
export function extractCompanyMetadata(raw: any, raw2?: any) {
  const r = raw || {}
  const r2 = raw2 || {}

  const industry = (
    r.compIndustry || r.companyIndustry || r.industryName || r.industry || r.brandIndustry || r.industryTypeString ||
    r2.compIndustry || r2.companyIndustry || r2.industryName || r2.industry || r2.brandIndustry || r2.industryTypeString || ''
  ).trim()

  const scale = (
    r.compScale || r.companyScale || r.companySize || r.companySizeString || r.sizeName || r.brandScaleName ||
    r2.compScale || r2.companyScale || r2.companySize || r2.companySizeString || r2.sizeName || r2.brandScaleName || ''
  ).trim()

  const stage = (
    r.compStage || r.companyStage || r.brandStageName || r.stageName || r.stage ||
    r2.compStage || r2.companyStage || r2.brandStageName || r2.stageName || r2.stage || ''
  ).trim()

  const companyType = (
    r.compKindName || r.companyType || r.companyTypeString || r.property ||
    r2.compKindName || r2.companyType || r2.companyTypeString || r2.property || ''
  ).trim()

  const logo = (
    r.compLogo || r.companyLogo || r.logo ||
    r2.compLogo || r2.companyLogo || r2.logo || ''
  ).trim()

  let creditCode = (
    r.creditCode || r.unifiedSocialCreditCode || r.creditNo || r.taxNumber || r.licenseNumber || r.businessLicenseCode ||
    r2.creditCode || r2.unifiedSocialCreditCode || r2.creditNo || r2.taxNumber || r2.licenseNumber || r2.businessLicenseCode || ''
  ).trim()

  // 自适应提取 18 位统一社会信用代码 (包含在执照/工商信息对象中)
  if (!creditCode && (r.businessLicense || r2.businessLicense || r.license || r2.license || r.businessInformation || r2.businessInformation)) {
    const licStr = JSON.stringify(r.businessLicense || r2.businessLicense || r.license || r2.license || r.businessInformation || r2.businessInformation)
    const m = licStr.match(/[0-9A-HJ-NPQRTUWXY]{2}\d{6}[0-9A-HJ-NPQRTUWXY]{10}/i)
    if (m) creditCode = m[0]
  }

  const tags = r.compTags || r.welfareList || r.labels || r2.compTags || r2.welfareList || r2.labels
  let welfareList: string | null = null
  if (Array.isArray(tags)) {
    welfareList = JSON.stringify(tags.filter((t: any) => typeof t === 'string' && t.trim()))
  } else if (typeof tags === 'string' && tags.trim()) {
    try {
      const parsed = JSON.parse(tags)
      if (Array.isArray(parsed)) welfareList = JSON.stringify(parsed)
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
