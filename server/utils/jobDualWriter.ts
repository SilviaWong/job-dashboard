import { normalizeJobData, type NormalizedJobData } from './jobNormalizer'
import { parseSalaryRange, parseExperienceYears, resolveStandardCity, safeStringifyArray } from './jobDataParser'

export interface ExtractedJobFields {
  structuredJobData: {
    salaryMin?: number | null
    salaryMax?: number | null
    salaryAvg?: number | null
    salaryMonths?: number
    province?: string | null
    city?: string | null
    cityCode?: string | null
    area?: string | null
    businessDistrict?: string | null
    address?: string | null
    experience?: string | null
    expMinYears?: number
    expMaxYears?: number | null
    skills?: string | null
    welfareList?: string | null
    hrName?: string | null
    hrPosition?: string | null
    isHeadhunter?: boolean
    clientCompanyName?: string | null
    platformPublishTime?: string | null
    platformUpdateTime?: string | null
  }
  payloadData: {
    jobDesc?: string | null
    jobUrl?: string | null
    rawData?: string | null
    rawData2?: string | null
  }
  normalized: NormalizedJobData
}

/**
 * 从原始数据中提取结构化字段与冷数据 Payload
 */
export function extractStructuredAndPayload(
  jobRaw: any,
  platform: string,
  stringifiedRawData?: string
): ExtractedJobFields {
  let parsedRaw2 = null
  if (jobRaw.rawData2) {
    try {
      parsedRaw2 = typeof jobRaw.rawData2 === 'string' ? JSON.parse(jobRaw.rawData2) : jobRaw.rawData2
    } catch (e) { }
  }

  // 确保附带 platform 属性以正确命中具体平台的 Normalizer 适配器
  let standardPlatform = platform || jobRaw.platform || ''
  const p = String(standardPlatform).toLowerCase()
  if (p.includes('boss')) standardPlatform = 'Boss直聘'
  else if (p.includes('51job') || p.includes('51')) standardPlatform = '51job'
  else if (p.includes('智联') || p.includes('zhilian')) standardPlatform = '智联'
  else if (p.includes('猎聘') || p.includes('liepin')) standardPlatform = '猎聘'

  const jobWithPlatform = {
    ...jobRaw,
    platform: standardPlatform
  }

  // 利用既有的标准化适配器提取数据
  const normalized = normalizeJobData(jobWithPlatform, jobRaw, parsedRaw2, null, jobRaw.jobDetail || null)

  const salaryRangeStr = normalized.salaryRange || jobRaw.salary || jobRaw.salaryDesc || jobRaw.provideSalaryString || ''
  const parsedSalary = parseSalaryRange(salaryRangeStr)

  const expStr = normalized.experience || jobRaw.experience || jobRaw.jobExperience || jobRaw.workYearString || ''
  const parsedExp = parseExperienceYears(expStr)

  const rawCityCandidate = normalized.city || jobRaw.cityName || jobRaw.workCity || (typeof jobRaw.city === 'string' ? jobRaw.city : null) || jobRaw.location || null
  const resolvedCity = resolveStandardCity(rawCityCandidate, jobRaw, standardPlatform)
  const city = resolvedCity.city
  const cityCode = resolvedCity.cityCode
  const province = resolvedCity.province

  let area = normalized.area || jobRaw.areaDistrict || jobRaw.area || null
  if (!area && typeof rawCityCandidate === 'string' && rawCityCandidate.includes('·')) {
    const parts = rawCityCandidate.split('·').map((s: string) => s.trim()).filter(Boolean)
    if (parts[1]) area = parts[1]
  }
  const businessDistrict = normalized.businessDistrict || jobRaw.businessDistrict || null
  const address = normalized.address || jobRaw.address || null

  const structuredJobData = {
    salaryMin: parsedSalary.salaryMin,
    salaryMax: parsedSalary.salaryMax,
    salaryAvg: parsedSalary.salaryAvg,
    salaryMonths: parsedSalary.salaryMonths,
    province,
    city,
    cityCode,
    area,
    businessDistrict,
    address,
    experience: expStr || null,
    expMinYears: parsedExp.expMinYears,
    expMaxYears: parsedExp.expMaxYears,
    skills: safeStringifyArray(normalized.skills),
    welfareList: safeStringifyArray(normalized.welfareList),
    hrName: normalized.hrName || jobRaw.hrName || null,
    hrPosition: normalized.hrPosition || jobRaw.hrPosition || null,
    isHeadhunter: !!normalized.isHeadhunter,
    clientCompanyName: normalized.clientCompanyName ? String(normalized.clientCompanyName).trim() : null,
    platformPublishTime: normalized.publishDate || null,
    platformUpdateTime: normalized.updateDate || null
  }

  const rawDataStr = stringifiedRawData || (typeof jobRaw === 'string' ? jobRaw : JSON.stringify(jobRaw))

  const payloadData = {
    jobDesc: normalized.jobDesc || null,
    jobUrl: normalized.jobUrl || null,
    rawData: rawDataStr,
    rawData2: jobRaw.rawData2 ? (typeof jobRaw.rawData2 === 'string' ? jobRaw.rawData2 : JSON.stringify(jobRaw.rawData2)) : null
  }

  return {
    structuredJobData,
    payloadData,
    normalized
  }
}

/**
 * 同步双写冷数据表 JobDetailPayload
 */
export async function syncJobDetailPayload(
  prisma: any,
  jobRecordId: string,
  payloadData: {
    jobDesc?: string | null
    jobUrl?: string | null
    rawData?: string | null
    rawData2?: string | null
  }
) {
  if (!jobRecordId) return

  try {
    await prisma.jobDetailPayload.upsert({
      where: { jobRecordId },
      create: {
        jobRecordId,
        jobDesc: payloadData.jobDesc || null,
        jobUrl: payloadData.jobUrl || null,
        rawData: payloadData.rawData || null,
        rawData2: payloadData.rawData2 || null
      },
      update: {
        jobDesc: payloadData.jobDesc || null,
        jobUrl: payloadData.jobUrl || null,
        rawData: payloadData.rawData || null,
        rawData2: payloadData.rawData2 || null
      }
    })
  } catch (error) {
    console.error(`[JobDetailPayload] Failed to sync payload for job ${jobRecordId}:`, error)
  }
}
