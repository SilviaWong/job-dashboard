import type { JobProcessor } from './types'

export const processDefaultJob: JobProcessor = async (job, platform, prisma) => {
  const jobId = job.jobId || job['职位ID'] || ''
  const jobTitle = job.title || job['职位名称'] || ''
  const companyName = job.companyName || job['公司名称'] || ''
  const salary = job.salary || job['薪资待遇'] || ''
  const location = job.location || job['工作地点'] || ''

  const stringifiedData = JSON.stringify(job)
  const createdAt = new Date()
  const updatedAt = new Date()

  const updateData: any = {
    title: String(jobTitle),
    companyName: String(companyName),
    salary: String(salary),
    location: String(location),
    rawData: stringifiedData
  }

  const createData: any = {
    jobId: String(jobId),
    title: String(jobTitle),
    companyName: String(companyName),
    salary: String(salary),
    location: String(location),
    platform: platform,
    dataSource: job.dataSource || 'unknown',
    createdAt: createdAt,
    updatedAt: updatedAt,
    rawData: stringifiedData
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
  if (companyName) {
    // 第一步：因为默认平台可能没有 companyId，所以只通过名称和平台查找（兜底方案）
    let existingCompany = await prisma.company.findFirst({
      where: { companyName: String(companyName), sourcePlatform: platform }
    })

    const companyUpdateData = {
      rawData: stringifiedData
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
            companyName: String(companyName),
            sourcePlatform: platform,
            rawData: stringifiedData
          }
        })
      } catch (err: any) {
        // 异常处理：捕获高并发下的唯一键冲突 (P2002)
        // 比如两个请求同时发现公司不存在，同时执行 create，第二个就会报错 P2002
        if (err.code === 'P2002') {
          // 既然冲突了，说明刚刚有别的请求创建了它，那我们再查一次把它找出来
          const newlyInserted = await prisma.company.findFirst({
            where: { companyName: String(companyName), sourcePlatform: platform }
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
