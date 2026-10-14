import type { JobProcessor } from './types'
import { cleanCompanyName, extractCompanyMetadata, resolveCompanyFullName, isCorporateName, safeUpdateCompany, findExistingCompanyOnConflict } from '../companyProcessors/types'
import { computeDescHash } from '../descHash'
import { resolveJobHrActive } from '../hrAnalytics'
import { extractStructuredAndPayload, syncJobDetailPayload } from '../jobDualWriter'

// 解析 Boss直聘 的职位数据
export const processBossJob: JobProcessor = async (job, platform, prisma) => {
  const jobDetail = job.jobDetail || {}
  const jobInfo = jobDetail.zpData?.jobInfo || {}
  const bossInfo = jobDetail.zpData?.bossInfo || {}
  const brandComInfo = jobDetail.zpData?.brandComInfo || {}

  const jobId = job.jobId || job.encryptJobId || jobInfo.encryptId || ''
  const jobTitle = job.jobName || jobInfo.jobName || ''
  const salary = job.salaryDesc || jobInfo.salaryDesc || ''
  const location = job.cityName || jobInfo.locationName || ''
  //jobInfo.address
  const education = job.jobDegree || jobInfo.degreeName || ''

  let companyName = job.brandName || ''
  let companyFullName = job.brandName || ''
  let companyId = job.encryptBrandId || brandComInfo.encryptBrandId || ''

  // Boss直聘中职位类型分为两种：一种是企业直招，另一种是猎头/代招
  // 1. 先由源数据判断（以源数据为主）
  const isSourceHeadhunter = job?.proxyJob !== 0 && (job?.proxyJob === 1 || jobInfo?.proxyJob === 1 || !!(job?.['岗位类型_外包猎头'] && String(job['岗位类型_外包猎头']).includes('猎头')))

  // 2. 检查所属公司是否在后台被手动标记为代招/猎头机构（手动标记作为补充）
  let isHeadhunterJob = isSourceHeadhunter
  if (!isHeadhunterJob) {
    const candidateName = cleanCompanyName(job.brandName || bossInfo.brandName || brandComInfo.brandName || '')
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

  if (!isHeadhunterJob) {
    // 企业直招的数据解析
    companyName = job.brandName || bossInfo.brandName || brandComInfo.brandName || brandComInfo.customerBrandName || ''
    companyFullName = job.brandName || bossInfo.brandName || brandComInfo.brandName || brandComInfo.customerBrandName || ''
    companyId = job.encryptBrandId || brandComInfo.encryptBrandId || ''
  } else {
    // 猎头/代招 的数据解析
    // 猎头/代招的 companyName 和 companyFullName 均保存猎头机构名称(bossInfo.brandName)
    // 甲方公司名称保存在 clientCompanyName 中，直接取 rawData.brandName（兜底取 brandComInfo.brandName / customerBrandName）
    companyName = bossInfo.brandName || job.brandName || ''
    companyFullName = bossInfo.brandName || job.brandName || ''
    // boss直聘中猎头/代招的职位数据没有公司Id
    companyId = ''
  }

  // 对公司名称和公司全称进行中文括号转英文括号，以及去除空格的处理
  const cleanName = cleanCompanyName(companyName)
  const detailFullName = !isHeadhunterJob
    ? (jobDetail['公司全称'] || jobDetail.companyFullName || brandComInfo.customerBrandName || jobInfo.brandComInfo?.customerBrandName || '')
    : ''
  const listFullName = cleanCompanyName(companyFullName)

  const stringifiedData = JSON.stringify(job)
  const createdAt = new Date()
  const updatedAt = new Date()
  const descHash = computeDescHash(job)
  const hr = resolveJobHrActive(job, jobDetail, platform)
  const { structuredJobData, payloadData } = extractStructuredAndPayload(job, platform, stringifiedData)
  if (isHeadhunterJob) {
    const clientBrand = cleanCompanyName(job.brandName || brandComInfo.brandName || brandComInfo.customerBrandName || '')
    structuredJobData.clientCompanyName = clientBrand || null
    structuredJobData.isHeadhunter = true
    const clientInd = (typeof job.brandIndustry === 'string' && !/^\d+$/.test(job.brandIndustry.trim())) ? job.brandIndustry.trim() : (brandComInfo.industryName || null)
    const clientSc = (typeof job.brandScaleName === 'string' ? job.brandScaleName : '') || (typeof brandComInfo.scaleName === 'string' ? brandComInfo.scaleName : '') || null
    const clientSt = (typeof job.brandStageName === 'string' ? job.brandStageName : '') || (typeof brandComInfo.stageName === 'string' ? brandComInfo.stageName : '') || null
    structuredJobData.clientIndustry = clientInd
    structuredJobData.clientScale = clientSc
    structuredJobData.clientStage = clientSt
  }

  // 检查已有职位指纹、薪资与现有全称（用于变动检测与全称防降级保护）
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

  let finalFullName = listFullName
  let resolvedCompany: any = null

  if (!isHeadhunterJob) {
    // 企业直招：阶梯式解析公司全称（Company表优先 -> 职位详情 -> 列表兜底，外加防降级保护与反哺）
    const resolved = await resolveCompanyFullName({
      prisma,
      platform: 'Boss直聘',
      companyId: companyId ? String(companyId) : null,
      cleanName,
      detailFullName,
      listFullName,
      existingJobFullName: existingJob?.companyFullName
    })
    finalFullName = resolved.finalFullName
    resolvedCompany = resolved.existingCompany
  } else {
    // 猎头代招：companyName 和 companyFullName 都保存猎头机构名称
    finalFullName = cleanName
  }

  // 组装职位更新数据
  const updateData: any = {
    title: String(jobTitle),
    companyName: String(cleanName),
    companyFullName: String(finalFullName),
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
    companyName: String(cleanName),
    companyFullName: String(finalFullName),
    companyId: companyId ? String(companyId) : null,
    salary: String(salary),
    location: String(location),
    education: String(education),
    platform: platform,
    dataSource: job.dataSource || 'Boss直聘',
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
  const meta = extractCompanyMetadata(job)
  const cleanBrandIndustry = (typeof job.brandIndustry === 'string' && !/^\d+$/.test(job.brandIndustry.trim())) ? job.brandIndustry.trim() : ''
  const cleanComIndustry = (typeof brandComInfo.industryName === 'string' && !/^\d+$/.test(brandComInfo.industryName.trim())) ? brandComInfo.industryName.trim() : ''
  const companyTableFullName = isHeadhunterJob ? cleanName : finalFullName
  const companyRawData = {
    companyId: companyId,
    companyFullName: companyTableFullName,
    companyName: cleanName || companyName,
    companyIndustry: isHeadhunterJob ? '人力资源服务' : (meta.industry || cleanBrandIndustry || cleanComIndustry || ''),
    companyScale: isHeadhunterJob ? '' : (meta.scale || (typeof job.brandScaleName === 'string' ? job.brandScaleName : '') || (typeof brandComInfo.scaleName === 'string' ? brandComInfo.scaleName : '') || ''),
    companyStage: isHeadhunterJob ? '' : (meta.stage || (typeof job.brandStageName === 'string' ? job.brandStageName : '') || (typeof brandComInfo.stageName === 'string' ? brandComInfo.stageName : '') || ''),
    sourcePlatform: 'Boss直聘'
  }

  if (cleanName || companyId) {
    let existingCompany = resolvedCompany

    // 第一步：如果之前未命中，尝试通过公司 ID 查找（最准确）
    if (!existingCompany && companyId) {
      existingCompany = await prisma.company.findFirst({
        where: { companyId: String(companyId), sourcePlatform: 'Boss直聘' }
      })
    }
    // 第二步：如果没有 ID 或者按 ID 没找到，尝试通过公司名称查找（兜底方案）
    if (!existingCompany && cleanName) {
      existingCompany = await prisma.company.findFirst({
        where: { companyName: cleanName, sourcePlatform: 'Boss直聘' }
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
        if ((!existingCompany.companyFullName || (!isCorporateName(existingCompany.companyFullName) && isCorporateName(companyTableFullName))) && companyTableFullName) {
          needUpdate.companyFullName = companyTableFullName
        }
        if (!existingCompany.companyId && companyId) needUpdate.companyId = String(companyId)
        if ((!existingCompany.industry || /^\d+$/.test(String(existingCompany.industry).trim())) && meta.industry) needUpdate.industry = meta.industry
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
            companyFullName: companyTableFullName ? String(companyTableFullName) : undefined,
            sourcePlatform: 'Boss直聘',
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
            'Boss直聘',
            cleanName,
            companyId ? String(companyId) : null,
            companyTableFullName ? String(companyTableFullName) : null
          )
          if (newlyInserted) {
            const needUpdate: any = {}
            if (isHeadhunterJob) {
              needUpdate.isAgency = true
              if (!newlyInserted.industry || newlyInserted.industry !== '人力资源服务') {
                needUpdate.industry = '人力资源服务'
              }
            } else if (!newlyInserted.isAgency) {
              if ((!newlyInserted.companyFullName || (!isCorporateName(newlyInserted.companyFullName) && isCorporateName(companyTableFullName))) && companyTableFullName) {
                needUpdate.companyFullName = companyTableFullName
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

