import type { JobProcessor } from './types'
import { cleanCompanyName, resolveCompanyFullName, isCorporateName } from '../companyProcessors/types'
import { computeDescHash } from '../descHash'
import { resolveJobHrActive } from '../hrAnalytics'
import { extractStructuredAndPayload, syncJobDetailPayload } from '../jobDualWriter'

export const processDefaultJob: JobProcessor = async (job, platform, prisma) => {
  const jobId = job.jobId || job['职位ID'] || ''
  const jobTitle = job.title || job['职位名称'] || ''
  const companyName = job.companyName || job['公司名称'] || ''
  const companyFullName = job.companyFullName || job['公司全称'] || job.fullCompanyName || ''
  const salary = job.salary || job['薪资待遇'] || ''
  const location = job.location || job['工作地点'] || ''
  const companyId = job.companyId || job['公司ID'] || ''

  const cleanName = cleanCompanyName(companyName)
  const detailFullName = job['公司全称'] || job.companyFullName || ''
  const listFullName = cleanCompanyName(companyFullName)

  const stringifiedData = JSON.stringify(job)
  const createdAt = new Date()
  const updatedAt = new Date()
  const descHash = computeDescHash(job)
  const hr = resolveJobHrActive(job, null, platform)
  const { structuredJobData, payloadData } = extractStructuredAndPayload(job, platform, stringifiedData)

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
    platform,
    companyId: companyId ? String(companyId) : null,
    cleanName,
    detailFullName,
    listFullName,
    existingJobFullName: existingJob?.companyFullName
  })

  const updateData: any = {
    title: String(jobTitle),
    companyName: String(cleanName || companyName),
    companyFullName: finalFullName || null,
    companyId: companyId ? String(companyId) : null,
    salary: String(salary),
    location: String(location),
    updatedAt: updatedAt,
    lastSeen: updatedAt,
    descHash: descHash,
    hrActiveStatus: hr.hrActiveStatus || null,
    hrActiveLevel: hr.hrActiveLevel,
    rawData: stringifiedData,
    ...structuredJobData
  }

  const createData: any = {
    jobId: String(jobId),
    title: String(jobTitle),
    companyName: String(cleanName || companyName),
    companyFullName: finalFullName || null,
    companyId: companyId ? String(companyId) : null,
    salary: String(salary),
    location: String(location),
    platform: platform,
    dataSource: job.dataSource || 'unknown',
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
      companyName: String(companyName),
      platform: platform,
      oldSalary: existingJob?.salary,
      newSalary: String(salary),
      reason: changeReason
    }
  }

  // 再保存公司数据
  const targetCompanyName = cleanName || companyName
  if (targetCompanyName) {
    let existingCompany = resolvedCompany
    if (!existingCompany && companyId) {
      existingCompany = await prisma.company.findFirst({
        where: { companyId: String(companyId), sourcePlatform: platform }
      })
    }
    if (!existingCompany && targetCompanyName) {
      existingCompany = await prisma.company.findFirst({
        where: { companyName: targetCompanyName, sourcePlatform: platform }
      })
    }

    const companyUpdateData: any = {
      rawData: stringifiedData
    }
    if (finalFullName && (!existingCompany?.companyFullName || (!isCorporateName(existingCompany.companyFullName) && isCorporateName(finalFullName)))) {
      companyUpdateData.companyFullName = finalFullName
    }
    if (companyId && !existingCompany?.companyId) {
      companyUpdateData.companyId = String(companyId)
    }

    // 第二步：执行入库操作
    if (existingCompany) {
      // 场景 A：公司已存在，直接更新数据
      await prisma.company.update({
        where: { id: existingCompany.id },
        data: companyUpdateData
      })
    } else {
      // 场景 B：公司不存在，尝试新建
      try {
        await prisma.company.create({
          data: {
            companyName: targetCompanyName,
            companyFullName: finalFullName || undefined,
            companyId: companyId ? String(companyId) : undefined,
            sourcePlatform: platform,
            rawData: stringifiedData
          }
        })
      } catch (err: any) {
        // 异常处理：捕获高并发下的唯一键冲突 (P2002)
        if (err.code === 'P2002') {
          const newlyInserted = await prisma.company.findFirst({
            where: { companyName: targetCompanyName, sourcePlatform: platform }
          })
          if (newlyInserted) {
            await prisma.company.update({
              where: { id: newlyInserted.id },
              data: companyUpdateData
            })
          }
        } else {
          throw err
        }
      }
    }
  }

  return savedJob
}
