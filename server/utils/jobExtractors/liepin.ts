import type { JobProcessor } from './types'
import { cleanCompanyName } from '../companyProcessors/types'
import { computeDescHash } from '../descHash'

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
  if (jobInfo.jobKind === '1' || jobInfo.jobKind == 1) {
    companyName = compInfo.fullCompanyName || hrCoName || ''
  } else {
    companyName = compInfo.compName || ''
  }
  companyId = compInfo.compId || extractedCompanyId || ''
  companyFullName = compInfo.fullCompanyName || hrCoName || ''

  // 对公司名称和公司全称进行中文括号转英文括号，以及去除空格的处理
  const cleanName = cleanCompanyName(companyName)
  const cleanFullName = cleanCompanyName(companyFullName)

  const stringifiedData = JSON.stringify(job)
  const createdAt = new Date()
  const updatedAt = new Date()
  const descHash = computeDescHash(job)

  // 组装职位更新数据
  const updateData: any = {
    title: String(jobTitle),
    companyName: cleanName,
    companyFullName: cleanFullName,
    companyId: companyId ? String(companyId) : null,
    salary: String(salary),
    location: String(location),
    education: String(education),
    updatedAt: updatedAt,
    lastSeen: updatedAt,
    descHash: descHash,
    rawData: stringifiedData
  }

  // 组装职位创建数据
  const createData: any = {
    jobId: String(jobId),
    title: String(jobTitle),
    companyName: cleanName,
    companyFullName: cleanFullName,
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
    rawData: stringifiedData
  }

  // if (useRawData2) {
  //   updateData.rawData2 = stringifiedData
  //   createData.rawData2 = stringifiedData
  //   createData.rawData = '{}'
  // } else {
  //   updateData.rawData = stringifiedData
  //   createData.rawData = stringifiedData
  // }

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
  const companyRawData = {
    ...compInfo,
    sourcePlatform: '猎聘'
  }

  if (cleanName || companyId) {
    let existingCompany = null

    // 第一步：尝试通过公司 ID 查找（最准确）
    if (companyId) {
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

    const companyUpdateData = {
      rawData: JSON.stringify(companyRawData),
      companyId: companyId ? String(companyId) : undefined,
      companyFullName: cleanFullName ? String(cleanFullName) : undefined
    }

    // 第三步：执行入库操作
    if (existingCompany) {
      // 场景 A：公司已存在，不更新数据
      // await prisma.company.update({
      //   where: { id: existingCompany.id },
      //   data: companyUpdateData
      // })
    } else if (cleanName) {
      // 场景 B：公司不存在，尝试新建
      try {
        await prisma.company.create({
          data: {
            companyName: cleanName,
            companyFullName: cleanFullName ? String(cleanFullName) : undefined,
            sourcePlatform: '猎聘',
            companyId: companyId ? String(companyId) : undefined,
            rawData: JSON.stringify(companyRawData)
          }
        })
      } catch (err: any) {
        // 异常处理：捕获高并发下的唯一键冲突 (P2002)
        // 比如两个请求同时发现公司不存在，同时执行 create，第二个就会报错 P2002
        if (err.code === 'P2002') {
          // 既然冲突了，说明刚刚有别的请求创建了它，那我们再查一次把它找出来
          const newlyInserted = await prisma.company.findFirst({
            where: { companyName: cleanName, sourcePlatform: '猎聘' }
          })
          if (newlyInserted) {
            // 转为更新操作
            await prisma.company.update({
              where: { id: newlyInserted.id },
              data: companyUpdateData
            })
          }
        } else {
          // 其他未知错误，直接抛出
          throw err
        }
      }
    }
  }

  return savedJob
}
