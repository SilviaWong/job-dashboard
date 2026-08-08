import type { JobProcessor } from './types'

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

  const stringifiedData = JSON.stringify(job)
  const createdAt = new Date()
  const updatedAt = new Date()

  // 组装职位更新数据
  const updateData: any = {
    title: String(jobTitle),
    companyName: String(companyName),
    companyFullName: String(companyFullName),
    companyId: companyId ? String(companyId) : null,
    salary: String(salary),
    location: String(location),
    updatedAt: updatedAt,
    rawData: stringifiedData
  }

  // 组装职位创建数据
  const createData: any = {
    jobId: String(jobId),
    title: String(jobTitle),
    companyName: String(companyName),
    companyFullName: String(companyFullName),
    companyId: companyId ? String(companyId) : null,
    salary: String(salary),
    location: String(location),
    platform: platform,
    dataSource: job.dataSource || '51job',
    createdAt: createdAt,
    updatedAt: updatedAt,
    rawData: stringifiedData
  }

  // 组装公司的rowData字段的json数据
  const companyRawData = {
    companyId: companyId,
    companyName: companyName,
    companyFullName: companyFullName,
    sourcePlatform: '51job'
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

  // 再保存公司数据
  if (companyName || companyId) {
    //根据公司id或者公司名称去查找，先通过id查找，如果没有则通过名称查找，如果有的话更新，没有的话创建
    //因为抓取的数据存在公司id为空的情况，所以如果companyId为空的话，就只有通过公司名称查找
    let existingCompany = null
    if (companyId) {
      existingCompany = await prisma.company.findFirst({
        where: { companyId: String(companyId), sourcePlatform: '51job' }
      })
    }
    if (!existingCompany && companyName) {
      existingCompany = await prisma.company.findFirst({
        where: { companyName: String(companyName), sourcePlatform: '51job' }
      })
    }

    // 从职位接口接收到的的职位json数据中提取的公司数据放到 company 表的 rawData 字段
    const companyUpdateData = {
      rawData: JSON.stringify(companyRawData),
      companyId: companyId ? String(companyId) : '',
      companyFullName: companyFullName ? String(companyFullName) : '',
      updatedAt: updatedAt
    }

    if (existingCompany) {
      await prisma.company.update({
        where: { id: existingCompany.id },
        data: companyUpdateData
      })
    } else if (companyName) {
      try {
        await prisma.company.create({
          data: {
            companyName: String(companyName),
            companyFullName: companyFullName ? String(companyFullName) : '',
            sourcePlatform: '51job',
            companyId: companyId ? String(companyId) : '',
            rawData: JSON.stringify(companyRawData),
            createdAt: createdAt,
            updatedAt: updatedAt
          }
        })
      } catch (err: any) {
        if (err.code === 'P2002') {
          const newlyInserted = await prisma.company.findFirst({
            where: { companyName: String(companyName), sourcePlatform: '51job' }
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
