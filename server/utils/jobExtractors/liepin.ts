import type { JobProcessor } from './types'
import { cleanCompanyName, extractCompanyMetadata, resolveCompanyFullName, isCorporateName, safeUpdateCompany, findExistingCompanyOnConflict } from '../companyProcessors/types'
import { computeDescHash } from '../descHash'
import { resolveJobHrActive } from '../hrAnalytics'
import { extractStructuredAndPayload, syncJobDetailPayload } from '../jobDualWriter'

// 解析 猎聘 的职位数据
export const processLiepinJob: JobProcessor = async (job, platform, prisma) => {
  const compInfo = job.comp || {}
  const jobInfo = job.job || {}
  const jobDetailJson = job.jobDetailJson || {}
  const supplementalDomData = jobDetailJson.supplementalDomData || {}
  const rawRecruiterInfo = supplementalDomData.recruiterInfo || []
  const recruiter = job.recruiter || {}

  const jobId = jobInfo.jobId || jobDetailJson.identifier?.value || ''
  const jobTitle = jobInfo.title || jobDetailJson.title || ''
  const salary = jobInfo.salary || supplementalDomData.salary || ''
  const location = jobInfo.dqCityName || jobInfo.dq || jobDetailJson.jobLocation?.address?.addressRegion || ''
  const education = jobInfo.requireEduLevel || jobDetailJson.educationRequirements || ''

  let companyName = ''
  let companyFullName = ''
  let companyId = ''
  let hrCoName = ''

  const compLink = compInfo.link || jobDetailJson.hiringOrganization?.sameAs || ''
  const match = compLink.match(/\/company\/(\d+)/)
  const extractedCompanyId = match ? match[1] : ''

  // const useRawData2 = job.dataSource === 'liepin_search_data'

  // 猎聘网的数据取值：如果是猎头/代招的职位，提取招聘人员所属公司作为公司名称数据
  if (Array.isArray(rawRecruiterInfo) && rawRecruiterInfo.length > 0) {
    const lastItem = rawRecruiterInfo[rawRecruiterInfo.length - 1]
    if (typeof lastItem === 'string') {
      hrCoName = lastItem.replace(/^·\s*/, '').trim()
    }
  }
  // 猎聘网标识公司直招还是猎头/代招的字段：jobKind，1表示猎头/代招，2表示公司直招
  // 1. 先由源数据判断（以源数据为主）
  const isSourceHeadhunter = jobInfo.jobKind === '1' || jobInfo.jobKind == 1 || String(job.jobKind) === '1' || job['岗位类型_外包猎头'] === '猎头/代招'

  // 2. 检查所属公司是否在后台被手动标记为代招/猎头机构（手动标记作为补充）
  let isHeadhunterJob = isSourceHeadhunter
  if (!isHeadhunterJob) {
    const candidateName = cleanCompanyName(compInfo.fullCompanyName || compInfo.compName || hrCoName || '')
    if (candidateName) {
      const agencyRecord = await prisma.company.findFirst({
        where: {
          OR: [
            { companyName: candidateName },
            { companyFullName: candidateName }
          ],
          isAgency: true
        },
        select: { id: true }
      })
      if (agencyRecord) {
        isHeadhunterJob = true
      }
    }
  }

  if (isHeadhunterJob) {
    companyName = compInfo.fullCompanyName || hrCoName || ''
    companyFullName = compInfo.fullCompanyName || hrCoName || ''
  } else {
    companyName = compInfo.compName || ''
    companyFullName = compInfo.fullCompanyName || ''
  }
  companyId = compInfo.compId || extractedCompanyId || ''

  // 对公司名称和公司全称进行中文括号转英文括号，以及去除空格的处理
  const cleanName = cleanCompanyName(companyName)
  const detailFullName = isHeadhunterJob
    ? (compInfo.fullCompanyName || hrCoName || '')
    : (job['公司全称'] || jobDetailJson?.hiringOrganization?.name || compInfo.fullCompanyName || compInfo.compFullName || '')
  const listFullName = cleanCompanyName(companyFullName)

  const stringifiedData = JSON.stringify(job)
  const createdAt = new Date()
  const updatedAt = new Date()
  const descHash = computeDescHash(job)
  const hr = resolveJobHrActive(job, null, platform)
  const { structuredJobData, payloadData } = extractStructuredAndPayload(job, platform, stringifiedData)
  if (isHeadhunterJob) {
    const clientBrand = cleanCompanyName(compInfo.compName || jobDetailJson?.hiringOrganization?.name || job['公司名称'] || '')
    if (clientBrand && clientBrand !== cleanName) {
      structuredJobData.clientCompanyName = clientBrand
    }
    structuredJobData.isHeadhunter = true
    structuredJobData.clientIndustry = compInfo.compIndustry || job['公司行业'] || null
    structuredJobData.clientScale = compInfo.compScale || job['公司规模'] || null
    structuredJobData.clientStage = compInfo.compStage || job['融资阶段'] || null
  }

  // 检查已有职位指纹与现有全称（用于变动检测与全称防降级保护）
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
      title: true,
      companyFullName: true
    }
  })

  // 阶梯式解析公司全称（Company表优先 -> 职位详情 -> 列表兜底，外加防降级保护与反哺）
  const { finalFullName, existingCompany: resolvedCompany } = await resolveCompanyFullName({
    prisma,
    platform: '猎聘',
    companyId: companyId ? String(companyId) : null,
    cleanName,
    detailFullName,
    listFullName,
    existingJobFullName: existingJob?.companyFullName
  })

  // 组装职位更新数据
  const updateData: any = {
    title: String(jobTitle),
    companyName: cleanName,
    companyFullName: finalFullName,
    companyId: companyId ? String(companyId) : null,
    salary: String(salary),
    location: String(location),
    education: String(education),
    updatedAt: updatedAt,
    lastSeen: updatedAt,
    descHash: descHash,
    hrActiveStatus: hr.hrActiveStatus || null,
    hrActiveLevel: hr.hrActiveLevel,
    rawData: stringifiedData,
    ...structuredJobData
  }

  // 组装职位创建数据
  const createData: any = {
    jobId: String(jobId),
    title: String(jobTitle),
    companyName: cleanName,
    companyFullName: finalFullName,
    companyId: companyId ? String(companyId) : null,
    salary: String(salary),
    location: String(location),
    education: String(education),
    platform: platform,
    dataSource: job.dataSource || '猎聘',
    createdAt: createdAt,
    updatedAt: updatedAt,
    firstSeen: createdAt,
    lastSeen: updatedAt,
    descHash: descHash,
    hrActiveStatus: hr.hrActiveStatus || null,
    hrActiveLevel: hr.hrActiveLevel,
    rawData: stringifiedData,
    ...structuredJobData
  }

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

  // 再保存公司数据（代招公司元数据隔离保护防火墙）
  const meta = extractCompanyMetadata(job, compInfo)
  const companyRawData = {
    ...compInfo,
    companyId: companyId || compInfo.compId,
    companyName: cleanName || compInfo.compName,
    companyFullName: finalFullName,
    companyIndustry: isHeadhunterJob ? '人力资源服务' : (meta.industry || compInfo.compIndustry || ''),
    companyScale: isHeadhunterJob ? '' : (meta.scale || compInfo.compScale || ''),
    companyStage: isHeadhunterJob ? '' : (meta.stage || compInfo.compStage || ''),
    sourcePlatform: '猎聘'
  }

  if (cleanName || companyId) {
    let existingCompany = resolvedCompany

    // 第一步：如果之前未查到，尝试通过公司 ID 查找（最准确）
    if (!existingCompany && companyId) {
      existingCompany = await prisma.company.findFirst({
        where: { companyId: String(companyId), sourcePlatform: '猎聘' }
      })
    }
    // 第二步：如果没有 ID 或者按 ID 没找到，尝试通过公司名称查找（兜底方案）
    if (!existingCompany && cleanName) {
      existingCompany = await prisma.company.findFirst({
        where: { companyName: cleanName, sourcePlatform: '猎聘' }
      })
    }

    // 第三步：执行入库操作
    if (existingCompany) {
      const needUpdate: any = {}
      if (isHeadhunterJob) {
        needUpdate.isAgency = true
        if (!existingCompany.industry || existingCompany.industry !== '人力资源服务') {
          needUpdate.industry = '人力资源服务'
        }
      } else if (!existingCompany.isAgency) {
        // 场景 A：仅企业直招公司允许补齐所属行业与规模
        if ((!existingCompany.companyFullName || (!isCorporateName(existingCompany.companyFullName) && isCorporateName(finalFullName))) && finalFullName) {
          needUpdate.companyFullName = finalFullName
        }
        if (!existingCompany.companyId && companyId) needUpdate.companyId = String(companyId)
        if (!existingCompany.industry && meta.industry) needUpdate.industry = meta.industry
        if (!existingCompany.scale && meta.scale) needUpdate.scale = meta.scale
        if (!existingCompany.stage && meta.stage) needUpdate.stage = meta.stage
        if (!existingCompany.companyType && meta.companyType) needUpdate.companyType = meta.companyType
        if (!existingCompany.welfareList && meta.welfareList) needUpdate.welfareList = meta.welfareList
      }
      if (!existingCompany.rawData) needUpdate.rawData = JSON.stringify(companyRawData)

      if (Object.keys(needUpdate).length > 0) {
        needUpdate.updatedAt = updatedAt
        await safeUpdateCompany(prisma, existingCompany.id, needUpdate)
      }
    } else if (cleanName) {
      // 场景 B：公司不存在，尝试新建
      try {
        await prisma.company.create({
          data: {
            companyName: cleanName,
            companyFullName: finalFullName ? String(finalFullName) : undefined,
            sourcePlatform: '猎聘',
            companyId: companyId ? String(companyId) : undefined,
            isAgency: isHeadhunterJob,
            industry: isHeadhunterJob ? '人力资源服务' : (meta.industry || undefined),
            scale: isHeadhunterJob ? undefined : (meta.scale || undefined),
            stage: isHeadhunterJob ? undefined : (meta.stage || undefined),
            companyType: isHeadhunterJob ? undefined : (meta.companyType || undefined),
            welfareList: isHeadhunterJob ? undefined : (meta.welfareList || undefined),
            rawData: JSON.stringify(companyRawData)
          }
        })
      } catch (err: any) {
        if (err.code === 'P2002') {
          const newlyInserted = await findExistingCompanyOnConflict(
            prisma,
            '猎聘',
            cleanName,
            companyId ? String(companyId) : null,
            finalFullName ? String(finalFullName) : null
          )
          if (newlyInserted) {
            const needUpdate: any = {}
            if (isHeadhunterJob) {
              needUpdate.isAgency = true
              if (!newlyInserted.industry || newlyInserted.industry !== '人力资源服务') {
                needUpdate.industry = '人力资源服务'
              }
            } else if (!newlyInserted.isAgency) {
              if ((!newlyInserted.companyFullName || (!isCorporateName(newlyInserted.companyFullName) && isCorporateName(finalFullName))) && finalFullName) {
                needUpdate.companyFullName = finalFullName
              }
              if (!newlyInserted.companyId && companyId) needUpdate.companyId = String(companyId)
              if (!newlyInserted.industry && meta.industry) needUpdate.industry = meta.industry
              if (!newlyInserted.scale && meta.scale) needUpdate.scale = meta.scale
            }
            if (Object.keys(needUpdate).length > 0) {
              needUpdate.updatedAt = updatedAt
              await safeUpdateCompany(prisma, newlyInserted.id, needUpdate)
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
