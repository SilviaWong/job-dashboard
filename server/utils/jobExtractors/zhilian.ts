import type { JobProcessor } from './types'

export const processZhilianJob: JobProcessor = async (job, platform, prisma) => {
  // 智联招聘的数据抓取有两种方式，获取到的职位json格式不一样，需要分别处理
  // 一种是job.dataSource === 'zhilian_scraped_data_v1'，另一种是job.dataSource === 'zhilian_scraped_data_v2'
  let jobId = ''
  let jobTitle = ''
  let salary = ''
  let location = ''
  let companyName = ''
  let companyFullName = ''
  let companyId = ''

  // 智联招聘中用于标识职位是公司直招还是猎头/代招
  // 0: 公司直招, 1/2/3/4: 猎头/代招, 空: 公司直招
  let jobType = 0

  let companyRawData = {}

  const useRawData2 = job.dataSource === 'zhilian_scraped_data_v1'

  if (useRawData2) {
    // 解析 zhilian_scraped_data_v1 中的数据
    const jobDeliverCache = job.jobDeliverCache || {}
    const jobDetailData = jobDeliverCache.jobDetailData || {}

    const jobDetail = job.jobDetail || {}
    const detailedPosition = jobDetail.detailedPosition || {}
    const compInfo = jobDetail.detailedCompany || {}

    jobType = jobDeliverCache.proxyModel?.recruitPosition || 0

    jobId = jobDeliverCache.number || jobDetailData.position?.base?.positionNumber || detailedPosition.number || detailedPosition.positionNumber || ''
    jobTitle = jobDeliverCache.name || jobDetailData.position?.base?.positionName || detailedPosition.name || detailedPosition.positionName || ''
    salary = jobDeliverCache.salary60 || jobDetailData.position?.base?.salary || detailedPosition.salary || ''
    location = jobDeliverCache.workCity || jobDetail.workCity || detailedPosition.positionWorkCity || ''
    // jobDetailData.position?.workLocation?.workAddress || detailedPosition.workAddress

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

    // 组装公司数据的rawData中的json数据
    companyRawData = {
      ...compInfo,
      sourcePlatform: '智联'
    }

  } else {
    // 解析 zhilian_scraped_data_v2 中的数据
    const jobDetailData = job.jobDetailData || {}

    jobType = job.proxyModel?.recruitPosition || 0

    jobId = job.number || jobDetailData.position?.base?.positionNumber || ''
    jobTitle = job.name || job.list_jobName || jobDetailData.position?.base?.positionName || ''
    salary = job.salary60 || jobDetailData.position?.base?.salary || ''
    location = job.workCity || job.jobRootOrgInfo?.cityName || ''
    // jobDetailData.position?.workLocation?.workAddress

    companyId = job.companyNumber || job.rootCompanyNumber || ''
    if (jobType === 0) {
      // 公司直招
      companyName = job.companyName || ''
      companyFullName = job.companyName || ''

    } else {
      // 猎头代招
      // 猎头代招时，companyName是猎头公司名称
      companyName = jobDetailData.position?.base?.staff?.companyName || ''
      companyFullName = jobDetailData.position?.base?.staff?.companyName || ''
    }


    // 组装公司数据的rawData中的json数据
    companyRawData = {
      companyId: companyId,
      companyName: companyName,
      sourcePlatform: '智联'
    }

  }

  const stringifiedData = JSON.stringify(job)
  const createdAt = new Date()
  const updatedAt = new Date()

  // 组装更新职位数据
  const updateData: any = {
    title: String(jobTitle),
    companyName: String(companyName),
    companyFullName: String(companyFullName),
    companyId: companyId ? String(companyId) : null,
    salary: String(salary),
    location: String(location),
    updatedAt: updatedAt
  }

  // 组装创建职位数据
  const createData: any = {
    jobId: String(jobId),
    title: String(jobTitle),
    companyName: String(companyName),
    companyFullName: String(companyFullName),
    companyId: companyId ? String(companyId) : null,
    salary: String(salary),
    location: String(location),
    platform: platform,
    dataSource: job.dataSource || '智联',
    createdAt: createdAt,
    updatedAt: updatedAt
  }

  // zhilian_scraped_data_v1 的数据使用rawData字段
  // zhilian_scraped_data_v2 的数据使用rawData2字段
  if (useRawData2) {
    updateData.rawData2 = stringifiedData
    createData.rawData2 = stringifiedData
    createData.rawData = '{}'
  } else {
    updateData.rawData = stringifiedData
    createData.rawData = stringifiedData
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
    if (!existingCompany && companyName) {
      existingCompany = await prisma.company.findFirst({
        where: { companyName: String(companyName), sourcePlatform: '智联' }
      })
    }

    const companyUpdateData = {
      rawData: JSON.stringify(companyRawData),
      companyId: companyId ? String(companyId) : '',
      companyFullName: companyFullName ? String(companyFullName) : ''
    }

    // 第三步：执行入库操作
    if (existingCompany) {
      // 场景 A：公司已存在，直接更新数据
      await prisma.company.update({
        where: { id: existingCompany.id },
        data: companyUpdateData
      })
    } else if (companyName) {
      // 场景 B：公司不存在，尝试新建
      try {
        await prisma.company.create({
          data: {
            companyName: String(companyName),
            companyFullName: companyFullName ? String(companyFullName) : '',
            sourcePlatform: '智联',
            companyId: companyId ? String(companyId) : '',
            rawData: JSON.stringify(companyRawData)
          }
        })
      } catch (err: any) {
        // 异常处理：捕获高并发下的唯一键冲突 (P2002)
        // 比如两个请求同时发现公司不存在，同时执行 create，第二个就会报错 P2002
        if (err.code === 'P2002') {
          // 既然冲突了，说明刚刚有别的请求创建了它，那我们再查一次把它找出来
          const newlyInserted = await prisma.company.findFirst({
            where: { companyName: String(companyName), sourcePlatform: '智联' }
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
