import type { JobProcessor } from './types'
import { cleanCompanyName } from '../companyProcessors/types'
import { computeDescHash } from '../descHash'

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
  // job.proxyJob === 0表示企业直招，job.proxyJob === 1表示猎头/代招 (另一个属性 jobInfo.proxyJob 的值也是一样的)
  // job.proxyType : 0表示企业直招，1,2,3,4 表示猎头/代招(另一个属性 jobInfo.proxyType 的值也是一样的,这两个属性只作为参考，不用放到代码逻辑中进行判断)
  if (job?.proxyJob === 0) {
    // 企业直招的数据解析
    companyName = job.brandName || bossInfo.brandName || brandComInfo.brandName || brandComInfo.customerBrandName || ''
    companyFullName = job.brandName || bossInfo.brandName || brandComInfo.brandName || brandComInfo.customerBrandName || ''
    companyId = job.encryptBrandId || brandComInfo.encryptBrandId || ''
  } else {
    // 猎头/代招 的数据解析
    // 猎头/代招的公司名取招聘人员所属公司(bossInfo.brandName)
    companyName = bossInfo.brandName || ''
    companyFullName = bossInfo.brandName || ''
    // boss直聘中猎头/代招的职位数据没有公司Id
    // companyId = ''
  }

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
    companyName: String(cleanName),
    companyFullName: String(cleanFullName),
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
    companyName: String(cleanName),
    companyFullName: String(cleanFullName),
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
    rawData: stringifiedData
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
    companyId: companyId,
    companyFullName: companyFullName,
    companyName: companyName,
    companyIndustry: job.brandIndustry || brandComInfo.industryName || '',
    companyScale: job.brandScaleName || brandComInfo.scaleName || '',
    sourcePlatform: 'Boss直聘'
  }

  if (cleanName || companyId) {
    //根据公司id或者公司名称去查找，先通过id查找，如果没有则通过名称查找，如果有的话更新，没有的话创建
    //因为抓取的数据存在公司id为空的情况，所以如果companyId为空的话，就只有通过公司名称查找
    let existingCompany = null

    // 第一步：尝试通过公司 ID 查找（最准确）
    if (companyId) {
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
            sourcePlatform: 'Boss直聘',
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
            where: { companyName: cleanName, sourcePlatform: 'Boss直聘' }
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
