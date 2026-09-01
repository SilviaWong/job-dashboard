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
 * 从原始 JSON 对象中提取结构化企业字段 (支持 raw 列表、raw2 主页、raw3 详情页三源合流)
 */
export function extractCompanyMetadata(raw: any, raw2?: any, raw3?: any) {
  const r = raw || {}
  const r2 = raw2 || {}
  const r3 = raw3 || {}

  const industry = (
    r.compIndustry || r.companyIndustry || r.industryName || r.industry || r.brandIndustry || r.industryTypeString || r['公司行业'] ||
    r2.compIndustry || r2.companyIndustry || r2.industryName || r2.industry || r2.brandIndustry || r2.industryTypeString || r2['公司行业'] ||
    r3.compIndustry || r3.companyIndustry || r3.industryName || r3.industry || r3.brandIndustry || r3.industryTypeString || r3['公司行业'] || ''
  ).trim()

  const scale = (
    r.compScale || r.companyScale || r.companySize || r.companySizeString || r.sizeName || r.brandScaleName || r['公司规模'] ||
    r2.compScale || r2.companyScale || r2.companySize || r2.companySizeString || r2.sizeName || r2.brandScaleName || r2['公司规模'] ||
    r3.compScale || r3.companyScale || r3.companySize || r3.companySizeString || r3.sizeName || r3.brandScaleName || r3['公司规模'] || ''
  ).trim()

  const stage = (
    r.compStage || r.companyStage || r.brandStageName || r.stageName || r.stage || r['融资阶段'] ||
    r2.compStage || r2.companyStage || r2.brandStageName || r2.stageName || r2.stage || r2['融资阶段'] ||
    r3.compStage || r3.companyStage || r3.brandStageName || r3.stageName || r3.stage || r3['融资阶段'] || ''
  ).trim()

  const companyType = (
    r.compKindName || r.companyType || r.companyTypeString || r.property || r['企业类型'] ||
    r2.compKindName || r2.companyType || r2.companyTypeString || r2.property || r2['企业类型'] ||
    r3.compKindName || r3.companyType || r3.companyTypeString || r3.property || r3['企业类型'] || ''
  ).trim()

  const logo = (
    r.compLogo || r.companyLogo || r.logo ||
    r2.compLogo || r2.companyLogo || r2.logo ||
    r3.compLogo || r3.companyLogo || r3.logo || ''
  ).trim()

  let creditCode = (
    r.creditCode || r.unifiedSocialCreditCode || r.creditNo || r.taxNumber || r.licenseNumber || r.businessLicenseCode || r['统一社会信用代码'] ||
    r2.creditCode || r2.unifiedSocialCreditCode || r2.creditNo || r2.taxNumber || r2.licenseNumber || r2.businessLicenseCode || r2['统一社会信用代码'] ||
    r3.creditCode || r3.unifiedSocialCreditCode || r3.creditNo || r3.taxNumber || r3.licenseNumber || r3.businessLicenseCode || r3['统一社会信用代码'] || ''
  ).trim()

  // 自适应提取 18 位统一社会信用代码 (包含在执照/工商信息对象中)
  if (!creditCode) {
    const licSource = r.businessLicense || r2.businessLicense || r3.businessLicense ||
                      r.license || r2.license || r3.license ||
                      r.businessInformation || r2.businessInformation || r3.businessInformation ||
                      r.companyExtDetail || r2.companyExtDetail || r3.companyExtDetail ||
                      r.raw_company_json || r2.raw_company_json || r3.raw_company_json
    if (licSource) {
      const licStr = JSON.stringify(licSource)
      const m = licStr.match(/[0-9A-HJ-NPQRTUWXY]{2}\d{6}[0-9A-HJ-NPQRTUWXY]{10}/i)
      if (m) creditCode = m[0]
    }
  }

  const tags = r.compTags || r.welfareList || r.labels || r['公司福利'] ||
               r2.compTags || r2.welfareList || r2.labels || r2['公司福利'] ||
               r3.compTags || r3.welfareList || r3.labels || r3['公司福利']
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

export interface DetailCompanyInput {
  companyName: string
  companyFullName?: string | null
  companyId?: string | null
  platform: string
  detailRaw: any
}

/**
 * 将职位详情页抓取到的附带企业工商数据，可靠写入 Company 表的 rawData3，并增量补齐一等公民结构化字段
 */
export async function upsertCompanyFromDetail(prisma: any, input: DetailCompanyInput) {
  const { companyName, companyFullName, companyId, platform, detailRaw } = input
  const cleanName = cleanCompanyName(companyName || '')
  const cleanFullName = cleanCompanyName(companyFullName || '')
  const stringifiedData = JSON.stringify(detailRaw)
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

  const meta = extractCompanyMetadata(null, null, detailRaw)

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
