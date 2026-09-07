import type { JobProcessor } from './types'
import { cleanCompanyName, extractCompanyMetadata } from '../companyProcessors/types'
import { computeDescHash } from '../descHash'
import { resolveJobHrActive } from '../hrAnalytics'
import { extractStructuredAndPayload, syncJobDetailPayload } from '../jobDualWriter'
import { parseSalaryRange, parseExperienceYears, deriveProvince } from '../jobDataParser'

export const processZhilianJob: JobProcessor = async (job, platform, prisma) => {
  // 智联招聘的数据抓取存在多种格式：
  // 1. zhilian_scraped_v2 (最新浏览器插件抓取格式，包含中文映射与原始详细对象)
  // 2. zhilian_scraped_data_v2 (v2 列表页与详情数据)
  // 3. zhilian_scraped_data_v1 (v1 格式，核心数据在 jobDeliverCache)
  // 4. 通用兜底格式

  const jobDeliverCache = job.jobDeliverCache || {}
  const jobDetailData = job.jobDetailData || jobDeliverCache.jobDetailData || {}
  const position = jobDetailData.position || {}
  const base = position.base || {}
  const staff = jobDetailData.staff || job.staff || {}

  const jobDetail = job.jobDetail || {}
  const detailedPosition = jobDetail.detailedPosition || {}
  const compInfo = jobDetail.detailedCompany || {}

  // 1. 职位类型 0: 公司直招, 1/2/3/4: 猎头/代招, 空: 公司直招
  let jobType = job['职位类型'] || job.proxyModel?.recruitPosition || detailedPosition.recruitPosition || jobDeliverCache.proxyModel?.recruitPosition || job.recruitPosition || (job.rpoProxied || job.rpoProxy ? 1 : 0) || 0
  if (typeof jobType === 'string') {
    jobType = parseInt(jobType, 10) || 0
  }

  // 2. 职位 ID
  const jobId = job['职位ID'] || job.jobId || job.number || job.id || base.positionNumber || detailedPosition.number || detailedPosition.positionNumber || jobDeliverCache.number || ''

  // 3. 职位名称
  const jobTitle = job['职位名称'] || job.jobName || job.name || job.title || job.list_jobName || base.positionName || detailedPosition.name || detailedPosition.positionName || base.name || jobDeliverCache.name || ''

  // 4. 薪资待遇
  let salary = job['薪资待遇'] || job.salary60 || base.salary || detailedPosition.salary || job.salary || jobDeliverCache.salary60 || ''
  if (!salary && (job.salaryReal || base.salaryReal)) {
    salary = job.salaryReal || base.salaryReal
  }

  // 5. 地理位置与区域
  const rawCity = job.workCity || detailedPosition.positionWorkCity || detailedPosition.workCity || jobDeliverCache.workCity || job.jobRootOrgInfo?.cityName || ''
  const rawDistrict = job.cityDistrict || detailedPosition.cityDistrict || detailedPosition.positionCityDistrict || jobDeliverCache.cityDistrict || ''
  const combinedLoc = [rawCity, rawDistrict].filter(Boolean).join('·')
  const location = job['工作地点'] || job['工作城市'] || combinedLoc || rawCity || jobDetail.workCity || ''

  // 6. 学历要求
  const education = job['学历要求'] || job['学历'] || job.education || base.education || detailedPosition.education || jobDeliverCache.education || ''

  // 7. 公司 ID
  const companyId = job['公司ID'] || job.companyId || compInfo.companyNumber || detailedPosition.companyNumber || job.companyNumber || job.rootCompanyNumber || jobDeliverCache.companyNumber || compInfo.id || ''

  // 8. 公司名称（简称）与公司全称
  let companyName = ''
  let companyFullName = ''

  if (jobType === 0) {
    // 公司直招：优先取简称作为展示名，全称保留完整工商名称
    companyName = job['公司名称'] || compInfo.companyShotName || compInfo.companyName || detailedPosition.companyName || job.companyName || jobDeliverCache.companyName || job['公司全称'] || ''
    companyFullName = job['公司全称'] || compInfo.companyName || detailedPosition.companyName || job.companyName || jobDeliverCache.companyName || job['公司名称'] || companyName || ''
  } else {
    // 猎头/代招：公司名为猎头公司名称
    companyName = job['公司名称'] || staff.companyName || jobDetailData.staff?.companyName || detailedPosition.staff?.companyName || base.staff?.companyName || ''
    companyFullName = job['公司全称'] || staff.companyName || jobDetailData.staff?.companyName || detailedPosition.staff?.companyName || base.staff?.companyName || companyName || ''
  }

  // 对公司名称和公司全称进行中文括号转英文括号，以及去除空格的处理
  const cleanName = cleanCompanyName(companyName)
  const cleanFullName = cleanCompanyName(companyFullName)

  // 9. 组装高保真企业数据（保留行业、规模、阶段、Logo、福利等核心元数据）
  const companyRawData: any = {
    ...compInfo,
    companyId: companyId ? String(companyId) : '',
    companyName: cleanName,
    companyFullName: cleanFullName,
    companyNumber: companyId ? String(companyId) : '',
    industryName: compInfo.industryNameLevel || compInfo.industryLevel || compInfo.industryName || job.industryName || job['公司行业'] || '',
    companySize: compInfo.companySize || compInfo.size || job.companySize || job['公司规模'] || '',
    financingStage: compInfo.financingStageName || job.financingStage?.name || job['融资阶段'] || '',
    companyType: compInfo.property || job.property || job.propertyName || job['企业类型'] || '',
    logo: compInfo.companyLogo || job.companyLogo || '',
    welfareList: detailedPosition.welfareTags || job.welfareList || job['公司福利'] || undefined,
    sourcePlatform: '智联'
  }

  const stringifiedData = JSON.stringify(job)
  const createdAt = new Date()
  const updatedAt = new Date()
  const descHash = computeDescHash(job)
  const hr = resolveJobHrActive(job, jobDetail, platform)

  // 10. 构建归一化入参，确保双写层获得完整的预处理数据
  const enrichedJob = {
    platform,
    ...job,
    jobId: String(jobId),
    title: String(jobTitle),
    name: String(jobTitle),
    salary: String(salary),
    salary60: job.salary60 || salary,
    location: String(location),
    education: String(education),
    companyName: cleanName,
    companyFullName: cleanFullName,
    companyId: companyId ? String(companyId) : '',
    isHeadhunter: Number(jobType) > 0
  }

  const { structuredJobData, payloadData } = extractStructuredAndPayload(enrichedJob, platform, stringifiedData)

  // 11. 针对结构化指标进行严格校验与智能兜底
  // 11.1 薪资数值型指标兜底
  if (structuredJobData.salaryMin === null && salary && !salary.includes('面议')) {
    const parsedSalary = parseSalaryRange(salary)
    structuredJobData.salaryMin = parsedSalary.salaryMin
    structuredJobData.salaryMax = parsedSalary.salaryMax
    structuredJobData.salaryAvg = parsedSalary.salaryAvg
    if (parsedSalary.salaryMonths) {
      structuredJobData.salaryMonths = parsedSalary.salaryMonths
    }
  }

  // 11.2 城市与区域拆解兜底
  if (!structuredJobData.city || !structuredJobData.area) {
    if (location.includes('·')) {
      const parts = location.split('·').map(s => s.trim()).filter(Boolean)
      if (!structuredJobData.city && parts[0]) structuredJobData.city = parts[0]
      if (!structuredJobData.area && parts[1]) structuredJobData.area = parts[1]
    } else if (location.includes(' ')) {
      const parts = location.split(/\s+/).map(s => s.trim()).filter(Boolean)
      if (!structuredJobData.city && parts[0]) structuredJobData.city = parts[0]
      if (!structuredJobData.area && parts[1]) structuredJobData.area = parts[1]
    } else if (!structuredJobData.city && location) {
      structuredJobData.city = location
    }
  }

  // 11.3 直辖市或所属省份自动推导
  const derivedProv = deriveProvince(structuredJobData.city || location)
  if (derivedProv) {
    structuredJobData.province = derivedProv
  }

  // 11.4 经验年限结构化兜底
  const expStr = job['工作经验'] || job.workingExp || base.positionWorkingExp || detailedPosition.positionWorkingExp || jobDeliverCache.workingExp || structuredJobData.experience || ''
  if (expStr && expStr !== '经验不限' && (structuredJobData.expMinYears === 0 || structuredJobData.expMinYears === undefined)) {
    const parsedExp = parseExperienceYears(expStr)
    structuredJobData.experience = expStr
    structuredJobData.expMinYears = parsedExp.expMinYears
    structuredJobData.expMaxYears = parsedExp.expMaxYears
  }

  // 组装更新职位数据
  const updateData: any = {
    title: String(jobTitle),
    companyName: String(cleanName),
    companyFullName: String(cleanFullName),
    companyId: companyId ? String(companyId) : null,
    salary: String(salary),
    location: String(location),
    education: String(education),
    dataSource: job.dataSource || '智联',
    updatedAt: updatedAt,
    lastSeen: updatedAt,
    descHash: descHash,
    hrActiveStatus: hr.hrActiveStatus || null,
    hrActiveLevel: hr.hrActiveLevel,
    isHeadhunter: Number(jobType) > 0,
    ...structuredJobData
  }

  // 组装创建职位数据
  const createData: any = {
    jobId: String(jobId),
    title: String(jobTitle),
    companyName: String(cleanName),
    companyFullName: String(cleanFullName),
    companyId: companyId ? String(companyId) : null,
    salary: String(salary),
    location: String(location),
    education: String(education),
    platform: platform,
    dataSource: job.dataSource || '智联',
    createdAt: createdAt,
    updatedAt: updatedAt,
    firstSeen: createdAt,
    lastSeen: updatedAt,
    descHash: descHash,
    hrActiveStatus: hr.hrActiveStatus || null,
    hrActiveLevel: hr.hrActiveLevel,
    isHeadhunter: Number(jobType) > 0,
    ...structuredJobData
  }

  const useRawData2 = job.dataSource === 'zhilian_scraped_data_v1'
  if (useRawData2) {
    updateData.rawData2 = stringifiedData
    createData.rawData2 = stringifiedData
    createData.rawData = '{}'
  } else {
    updateData.rawData = stringifiedData
    createData.rawData = stringifiedData
  }

  // 检查已有职位指纹与薪资变化
  const existingJob = await prisma.job.findUnique({
    where: {
      jobId_platform: {
        jobId: String(jobId),
        platform: platform
      }
    },
    select: {
      descHash: true,
      salary: true,
      title: true
    }
  })

  let isChanged = false
  let changeReason = ''
  if (existingJob) {
    const descChanged = !!(existingJob.descHash && existingJob.descHash !== descHash)
    const salaryChanged = !!(existingJob.salary && existingJob.salary !== String(salary))
    if (descChanged || salaryChanged) {
      isChanged = true
      changeReason = descChanged && salaryChanged ? 'JD描述与薪资均变更' : (salaryChanged ? '薪资调整' : 'JD描述更新')
    }
  }

  // 先保存职位数据
  const savedJob = await prisma.job.upsert({
    where: {
      jobId_platform: {
        jobId: String(jobId),
        platform: platform
      }
    },
    update: updateData,
    create: createData
  })

  // 阶段一双写：同步更新冷数据附表
  await syncJobDetailPayload(prisma, savedJob.id, payloadData)

  if (isChanged) {
    ;(savedJob as any).isChanged = true
    ;(savedJob as any).changeDetail = {
      jobId: String(jobId),
      title: String(jobTitle),
      companyName: String(cleanName),
      platform: platform,
      oldSalary: existingJob?.salary,
      newSalary: String(salary),
      reason: changeReason
    }
  }

  // 再保存公司数据
  if (cleanName || companyId) {
    let existingCompany = null

    // 第一步：尝试通过公司 ID 查找（最准确）
    if (companyId) {
      existingCompany = await prisma.company.findFirst({
        where: { companyId: String(companyId), sourcePlatform: '智联' }
      })
    }
    // 第二步：如果没有 ID 或者按 ID 没找到，尝试通过公司名称查找（兜底方案）
    if (!existingCompany && cleanName) {
      existingCompany = await prisma.company.findFirst({
        where: { companyName: cleanName, sourcePlatform: '智联' }
      })
    }

    const meta = extractCompanyMetadata(job, companyRawData)

    // 第三步：执行入库操作
    if (existingCompany) {
      // 场景 A：公司已存在，增量补齐原本缺失的结构化字段及更丰富的 rawData
      const needUpdate: any = {}
      if (!existingCompany.companyFullName && cleanFullName) needUpdate.companyFullName = cleanFullName
      if (!existingCompany.companyId && companyId) needUpdate.companyId = String(companyId)
      if (!existingCompany.industry && meta.industry) needUpdate.industry = meta.industry
      if (!existingCompany.scale && meta.scale) needUpdate.scale = meta.scale
      if (!existingCompany.stage && meta.stage) needUpdate.stage = meta.stage
      if (!existingCompany.companyType && meta.companyType) needUpdate.companyType = meta.companyType
      if (!existingCompany.creditCode && meta.creditCode) needUpdate.creditCode = meta.creditCode
      if (!existingCompany.logo && meta.logo) needUpdate.logo = meta.logo
      if (!existingCompany.welfareList && meta.welfareList) needUpdate.welfareList = meta.welfareList

      // 如果已有 rawData 过于简陋（如小于 100 字节），更新为完整企业元数据
      if (!existingCompany.rawData || existingCompany.rawData.length < 100) {
        needUpdate.rawData = JSON.stringify(companyRawData)
      }

      if (Object.keys(needUpdate).length > 0) {
        needUpdate.updatedAt = new Date()
        await prisma.company.update({
          where: { id: existingCompany.id },
          data: needUpdate
        })
      }
    } else if (cleanName) {
      // 场景 B：公司不存在，尝试新建
      try {
        await prisma.company.create({
          data: {
            companyName: cleanName,
            companyFullName: cleanFullName ? String(cleanFullName) : '',
            sourcePlatform: '智联',
            companyId: companyId ? String(companyId) : '',
            industry: meta.industry || undefined,
            scale: meta.scale || undefined,
            stage: meta.stage || undefined,
            companyType: meta.companyType || undefined,
            creditCode: meta.creditCode || undefined,
            logo: meta.logo || undefined,
            welfareList: meta.welfareList || undefined,
            rawData: JSON.stringify(companyRawData)
          }
        })
      } catch (err: any) {
        if (err.code === 'P2002') {
          const newlyInserted = await prisma.company.findFirst({
            where: { companyName: cleanName, sourcePlatform: '智联' }
          })
          if (newlyInserted) {
            const needUpdate: any = {}
            if (!newlyInserted.companyFullName && cleanFullName) needUpdate.companyFullName = cleanFullName
            if (!newlyInserted.companyId && companyId) needUpdate.companyId = String(companyId)
            if (!newlyInserted.industry && meta.industry) needUpdate.industry = meta.industry
            if (!newlyInserted.scale && meta.scale) needUpdate.scale = meta.scale
            if (!newlyInserted.stage && meta.stage) needUpdate.stage = meta.stage
            if (!newlyInserted.companyType && meta.companyType) needUpdate.companyType = meta.companyType
            if (!newlyInserted.creditCode && meta.creditCode) needUpdate.creditCode = meta.creditCode
            if (!newlyInserted.logo && meta.logo) needUpdate.logo = meta.logo
            if (!newlyInserted.welfareList && meta.welfareList) needUpdate.welfareList = meta.welfareList
            if (Object.keys(needUpdate).length > 0) {
              needUpdate.updatedAt = new Date()
              await prisma.company.update({
                where: { id: newlyInserted.id },
                data: needUpdate
              })
            }
          }
        } else {
          throw err
        }
      }
    }
  }

  return savedJob
}
