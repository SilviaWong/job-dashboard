import type { JobProcessor } from './types'
import { cleanCompanyName, extractCompanyMetadata } from '../companyProcessors/types'
import { computeDescHash } from '../descHash'
import { resolveJobHrActive } from '../hrAnalytics'
import { extractStructuredAndPayload, syncJobDetailPayload } from '../jobDualWriter'

export const processZhilianJob: JobProcessor = async (job, platform, prisma) => {
  // 智联招聘的数据抓取有两种方式，获取到的职位json格式不一样，需要分别处理
  // 一种是job.dataSource === 'zhilian_scraped_data_v1'，另一种是job.dataSource === 'zhilian_scraped_data_v2'
  let jobId = ''
  let jobTitle = ''
  let salary = ''
  let location = ''
  let education = ''
  let companyName = ''
  let companyFullName = ''
  let companyId = ''
  let cleanName = ''
  let cleanFullName = ''

  // 智联招聘中用于标识职位是公司直招还是猎头/代招
  // 0: 公司直招, 1/2/3/4: 猎头/代招, 空: 公司直招
  let jobType = 0

  let companyRawData = {}

  const useRawData2 = job.dataSource === 'zhilian_scraped_data_v1'

  switch (job.dataSource) {
    case 'zhilian_scraped_data_v1': {
      // 解析 zhilian_scraped_data_v1 中的数据
      const jobDeliverCache = job.jobDeliverCache || {}
      const jobDetailData = jobDeliverCache.jobDetailData || {}
      const position = jobDetailData.position || {}
      const base = position.base || {}

      const jobDetail = job.jobDetail || {}
      const detailedPosition = jobDetail.detailedPosition || {}
      const compInfo = jobDetail.detailedCompany || {}

      jobType = jobDeliverCache.proxyModel?.recruitPosition || 0

      jobId = jobDeliverCache.number || base.positionNumber || detailedPosition.number || detailedPosition.positionNumber || ''
      jobTitle = jobDeliverCache.name || base.positionName || detailedPosition.name || detailedPosition.positionName || ''
      salary = jobDeliverCache.salary60 || base.salary || detailedPosition.salary || ''
      location = jobDeliverCache.workCity || jobDetail.workCity || detailedPosition.positionWorkCity || ''
      // jobDetailData.position?.workLocation?.workAddress || detailedPosition.workAddress
      education = jobDeliverCache.education || detailedPosition.education || ''

      companyId = compInfo.companyNumber || detailedPosition.companyNumber || jobDeliverCache.companyNumber || ''
      if (jobType === 0) {
        // 公司直招
        companyName = compInfo.companyName || detailedPosition.companyName || jobDeliverCache.companyName || ''
        companyFullName = compInfo.companyName || detailedPosition.companyName || jobDeliverCache.companyName || ''

      } else {
        // 猎头代招
        // 猎头代招时，companyName是猎头公司名称
        companyName = jobDetailData.staff?.companyName || detailedPosition.staff?.companyName || ''
        companyFullName = jobDetailData.staff?.companyName || detailedPosition.staff?.companyName || ''

      }

      // 对公司名称和公司全称进行中文括号转英文括号，以及去除空格的处理
      cleanName = cleanCompanyName(companyName)
      cleanFullName = cleanCompanyName(companyFullName)

      // 组装公司数据的rawData中的json数据
      companyRawData = {
        ...compInfo,
        sourcePlatform: '智联'
      }
      break
    }
    case 'zhilian_scraped_data_v2': {
      // 解析 zhilian_scraped_data_v2 中的数据
      const jobDetailData = job.jobDetailData || {}
      const position = jobDetailData.position || {}
      const base = position.base || {}

      jobType = job.proxyModel?.recruitPosition || 0

      jobId = job.number || base.positionNumber || ''
      jobTitle = job.name || job.list_jobName || base.positionName || ''
      salary = job.salary60 || base.salary || ''
      location = job.workCity || job.jobRootOrgInfo?.cityName || ''
      // jobDetailData.position?.workLocation?.workAddress
      education = job.education || base.education || ''

      companyId = job.companyNumber || job.rootCompanyNumber || ''
      if (jobType === 0) {
        // 公司直招
        companyName = job.companyName || ''
        companyFullName = job.companyName || ''

      } else {
        // 猎头代招
        // 猎头代招时，companyName是猎头公司名称
        companyName = base.staff?.companyName || ''
        companyFullName = base.staff?.companyName || ''
      }

      // 对公司名称和公司全称进行中文括号转英文括号，以及去除空格的处理
      cleanName = cleanCompanyName(companyName)
      cleanFullName = cleanCompanyName(companyFullName)

      // 组装公司数据的rawData中的json数据
      companyRawData = {
        companyId: companyId,
        companyName: cleanName,
        sourcePlatform: '智联'
      }
      break
    }
    case 'zhilian_scraped_v2': {
      // 解析 zhilian_scraped_v2 中的数据 新版的智联招聘抓取数据解析逻辑
      const jobDetailData = job.jobDetailData || {}
      const position = jobDetailData.position || {}
      const base = position.base || {}

      const jobDetail = job.jobDetail || {}
      const detailedPosition = jobDetail.detailedPosition || {}
      const compInfo = jobDetail.detailedCompany || {}

      // 职位类型 0: 公司直招, 1/2/3/4: 猎头/代招, 空: 公司直招
      jobType = job.proxyModel?.recruitPosition || detailedPosition.recruitPosition || 0

      jobId = job['职位ID'] || job.number || base.positionNumber || detailedPosition.number || detailedPosition.positionNumber || job.jobId || ''
      jobTitle = job['职位名称'] || job.name || job.list_jobName || base.positionName || detailedPosition.name || detailedPosition.positionName || base.name || ''
      salary = job['薪资待遇'] || job.salary60 || base.salary || detailedPosition.salary || ''
      location = job['工作地点'] || job.workCity || jobDetail.workCity || detailedPosition.positionWorkCity || job.jobRootOrgInfo?.cityName || ''
      // jobDetailData.position?.workLocation?.workAddress
      education = job['学历要求'] || job.education || base.education || detailedPosition.education || ''

      companyId = job['公司ID'] || job.companyNumber || job.rootCompanyNumber || compInfo.companyNumber || detailedPosition.companyNumber || ''
      if (jobType === 0) {
        // 公司直招
        companyName = job['公司名称'] || compInfo.companyName || compInfo.companyShotName || detailedPosition.companyName || job.companyName || job['公司全称'] || ''
        companyFullName = job['公司全称'] || compInfo.companyName || detailedPosition.companyName || job.companyName || companyName || ''

      } else {
        // 猎头代招
        // 猎头代招时，companyName是猎头公司名称
        companyName = job['公司名称'] || jobDetailData.staff?.companyName || detailedPosition.staff?.companyName || ''
        companyFullName = job['公司全称'] || jobDetailData.staff?.companyName || detailedPosition.staff?.companyName || companyName || ''
      }

      // 对公司名称和公司全称进行中文括号转英文括号，以及去除空格的处理
      cleanName = cleanCompanyName(companyName)
      cleanFullName = cleanCompanyName(companyFullName)

      // 组装公司数据的rawData中的json数据
      companyRawData = {
        companyId: companyId,
        companyName: cleanName,
        sourcePlatform: '智联'
      }
      break
    }
    default: {
      const jobDetailData = job.jobDetailData || {}
      const position = jobDetailData.position || {}
      const base = position.base || {}

      jobType = job.proxyModel?.recruitPosition || 0

      jobId = job['职位ID'] || job.number || base.positionNumber || job.jobId || ''
      jobTitle = job['职位名称'] || job.name || job.list_jobName || base.positionName || ''
      salary = job['薪资待遇'] || job.salary60 || base.salary || ''
      location = job['工作地点'] || job.workCity || job.jobRootOrgInfo?.cityName || ''
      // jobDetailData.position?.workLocation?.workAddress
      education = job['学历要求'] || job.education || base.education || ''

      companyId = job['公司ID'] || job.companyNumber || job.rootCompanyNumber || ''
      if (jobType === 0) {
        // 公司直招
        companyName = job['公司名称'] || job.companyName || job['公司全称'] || ''
        companyFullName = job['公司全称'] || job.companyName || companyName || ''

      } else {
        // 猎头代招
        // 猎头代招时，companyName是猎头公司名称
        companyName = job['公司名称'] || base.staff?.companyName || ''
        companyFullName = job['公司全称'] || base.staff?.companyName || companyName || ''
      }

      // 对公司名称和公司全称进行中文括号转英文括号，以及去除空格的处理
      cleanName = cleanCompanyName(companyName)
      cleanFullName = cleanCompanyName(companyFullName)

      // 组装公司数据的rawData中的json数据
      companyRawData = {
        companyId: companyId,
        companyName: cleanName,
        sourcePlatform: '智联'
      }
      break
    }
  }

  const stringifiedData = JSON.stringify(job)
  const createdAt = new Date()
  const updatedAt = new Date()
  const descHash = computeDescHash(job)
  const hr = resolveJobHrActive(job, null, platform)
  const { structuredJobData, payloadData } = extractStructuredAndPayload(job, platform, stringifiedData)

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
    ...structuredJobData
  }

  // zhilian_scraped_data_v1 的数据使用rawData2字段
  // zhilian_scraped_data_v2 的数据使用rawData字段
  // zhilian_scraped_v2 的数据使用rawData字段
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
    // 根据公司id或者公司名称去查找，先通过id查找，如果没有则通过名称查找，如果有的话更新，没有的话创建
    // 因为抓取的数据存在公司id为空的情况，所以如果companyId为空的话，就只有通过公司名称查找
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

    const companyUpdateData = {
      rawData: JSON.stringify(companyRawData),
      companyId: companyId ? String(companyId) : '',
      companyFullName: cleanFullName ? String(cleanFullName) : ''
    }

    const meta = extractCompanyMetadata(job, companyRawData)
    // 第三步：执行入库操作
    if (existingCompany) {
      // 场景 A：公司已存在，增量补齐原本缺失的结构化字段
      const needUpdate: any = {}
      if (!existingCompany.companyFullName && cleanFullName) needUpdate.companyFullName = cleanFullName
      if (!existingCompany.companyId && companyId) needUpdate.companyId = String(companyId)
      if (!existingCompany.industry && meta.industry) needUpdate.industry = meta.industry
      if (!existingCompany.scale && meta.scale) needUpdate.scale = meta.scale
      if (!existingCompany.stage && meta.stage) needUpdate.stage = meta.stage
      if (!existingCompany.companyType && meta.companyType) needUpdate.companyType = meta.companyType
      if (!existingCompany.welfareList && meta.welfareList) needUpdate.welfareList = meta.welfareList
      if (!existingCompany.rawData) needUpdate.rawData = JSON.stringify(companyRawData)

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
