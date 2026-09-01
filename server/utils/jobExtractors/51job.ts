import type { JobProcessor } from './types'
import { cleanCompanyName } from '../companyProcessors/types'
import { computeDescHash } from '../descHash'
import { resolveJobHrActive } from '../hrAnalytics'
import { extractStructuredAndPayload, syncJobDetailPayload } from '../jobDualWriter'

export const process51Job: JobProcessor = async (job, platform, prisma) => {
  // 解析 51job 的职位数据
  const detailJobInfo = job.raw_detail_json?.detailJobInfo || {}

  const jobId = job.jobId || detailJobInfo.jobId || ''
  const jobTitle = job.jobName || detailJobInfo.jobname || ''
  const companyId = job.encCoId || detailJobInfo.pcdetailJobInfo?.encryCompanyId || ''
  const companyName = job.companyName || detailJobInfo.coName || ''
  const companyFullName = job.fullCompanyName || detailJobInfo.companyName || ''
  const salary = job.provideSalaryString || detailJobInfo.provideSalaryString || ''
  const location = job.jobAreaLevelDetail?.cityString || detailJobInfo.jobAreaLevelDetail?.cityString || ''
  // detailJobInfo.address || job._detail_address || detailJobInfo.companyAddress || ''
  const education = job.degreeString || detailJobInfo.degreeString || ''

  const stringifiedData = JSON.stringify(job)
  const createdAt = new Date()
  const updatedAt = new Date()
  const descHash = computeDescHash(job)
  const hr = resolveJobHrActive(job, null, platform)
  const { structuredJobData, payloadData } = extractStructuredAndPayload(job, platform, stringifiedData)

  // 对公司名称和公司全称进行中文括号转英文括号，以及去除空格的处理
  const cleanName = cleanCompanyName(companyName)
  const cleanFullName = cleanCompanyName(companyFullName)

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
    companyFullName: String(cleanFullName),
    companyId: companyId ? String(companyId) : null,
    salary: String(salary),
    location: String(location),
    education: String(education),
    platform: platform,
    dataSource: job.dataSource || '51job',
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

  // 组装公司的rowData字段的json数据
  const companyRawData = {
    companyId: companyId,
    companyName: cleanName,
    companyFullName: cleanFullName,
    sourcePlatform: '51job'
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
    ; (savedJob as any).isChanged = true
      ; (savedJob as any).changeDetail = {
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
    //根据公司id或者公司名称去查找，先通过id查找，如果没有则通过名称查找，如果有的话更新，没有的话创建
    //因为抓取的数据存在公司id为空的情况，所以如果companyId为空的话，就只有通过公司名称查找
    let existingCompany = null
    if (companyId) {
      existingCompany = await prisma.company.findFirst({
        where: { companyId: String(companyId), sourcePlatform: '51job' }
      })
    }
    if (!existingCompany && cleanName) {
      existingCompany = await prisma.company.findFirst({
        where: { companyName: cleanName, sourcePlatform: '51job' }
      })
    }

    // 从职位接口接收到的的职位json数据中提取的公司数据放到 company 表的 rawData 字段
    const companyUpdateData = {
      rawData: JSON.stringify(companyRawData),
      companyId: companyId ? String(companyId) : '',
      companyFullName: cleanFullName ? String(cleanFullName) : '',
      updatedAt: updatedAt
    }

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
            companyFullName: cleanFullName ? String(cleanFullName) : '',
            sourcePlatform: '51job',
            companyId: companyId ? String(companyId) : '',
            rawData: JSON.stringify(companyRawData),
            createdAt: createdAt,
            updatedAt: updatedAt
          }
        })
      } catch (err: any) {
        // 异常处理：捕获高并发下的唯一键冲突 (P2002)
        // 比如两个请求同时发现公司不存在，同时执行 create，第二个就会报错 P2002
        if (err.code === 'P2002') {
          // 既然冲突了，说明刚刚有别的请求创建了它，那我们再查一次把它找出来
          const newlyInserted = await prisma.company.findFirst({
            where: { companyName: cleanName, sourcePlatform: '51job' }
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
