import prisma from '../utils/prisma'
import { extractAndSaveCompany } from '../utils/companyExtractor'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!Array.isArray(body)) {
    return { success: false, message: 'Invalid data format. Expected an array of jobs.' }
  }

  const upsertPromises = body.map(async (job) => {
    let rawPlatform = String(job.platform || job['平台'] || '未知')
    const lowerPlatform = rawPlatform.toLowerCase()
    if (lowerPlatform === 'liepin' || lowerPlatform === '猎聘') rawPlatform = '猎聘'
    else if (lowerPlatform === 'zhilian' || lowerPlatform === '智联') rawPlatform = '智联'
    else if (lowerPlatform === 'boss' || lowerPlatform === 'boss直聘') rawPlatform = 'Boss直聘'
    else if (lowerPlatform === '51job') rawPlatform = '51job'

    const parseDate = (dateStr?: string) => {
      if (!dateStr) return undefined
      const d = new Date(dateStr.replace(/-/g, '/'))
      return isNaN(d.getTime()) ? undefined : d
    }

    let extractedId = ''
    let extractedTitle = ''
    let extractedCompany = ''
    let extractedSalary = ''
    let extractedLocation = ''
    let extractedCreatedAt = new Date()
    let extractedUpdatedAt = new Date()

    switch (rawPlatform) {
      case 'Boss直聘':
        extractedId = job.jobId || job.encryptJobId || job.jobDetail?.zpData?.jobInfo?.encryptId || job['职位ID']
        extractedTitle = job.jobName || job.jobDetail?.zpData?.jobInfo?.jobName || job['职位名称']
        extractedCompany = job.jobDetail?.zpData?.bossInfo?.brandName || job.brandName || job['公司全称'] || job['公司名称']
        extractedSalary = job.salaryDesc || job['薪资待遇']
        extractedLocation = job.jobDetail?.zpData?.jobInfo?.address || job['工作地点']
        break
      case '猎聘':
        let hrCoName = ''
        const recruiterInfo = job.jobDetailJson?.supplementalDomData?.recruiterInfo
        if (Array.isArray(recruiterInfo) && recruiterInfo.length > 0) {
          const lastItem = recruiterInfo[recruiterInfo.length - 1]
          if (typeof lastItem === 'string') {
            hrCoName = lastItem.replace(/^·\s*/, '').trim()
          }
        }
        extractedId = job.job?.jobId || job.jobDetailJson?.identifier?.value || job['职位ID']
        extractedTitle = job.job?.title || job.jobDetailJson?.title
        extractedCompany = job.comp?.fullCompanyName || hrCoName || job.comp?.compName
        extractedSalary = job.job?.salary || job.jobDetailJson?.supplementalDomData?.salary
        extractedLocation = job.jobDetailJson?.jobLocation?.streetAddress || job.job?.dq
        break
      case '智联':
        extractedId = job.number || job.jobDetailData?.position?.base?.positionNumber || job.jobDetail?.detailedPosition?.number || job.jobDetail?.detailedPosition?.positionNumber || job['职位ID']  //job.jobId || job.jobDetailData?.position?.base?.positionId
        extractedTitle = job.name || job.list_jobName || job.jobDetail?.jobDetailData?.position?.base?.positionName || job.jobDetail?.detailedPosition?.name || job.jobDetail?.detailedPosition?.positionName || job['职位名称']
        extractedCompany = job.companyName || job.jobDetail?.detailedCompany?.companyName
        extractedSalary = job.salary60 || job.jobDetailData?.position?.base?.salary || job.jobDetail?.detailedPosition?.salary
        extractedLocation = job.jobDetailData?.position?.workLocation?.workAddress || job.jobDetailData?.position?.workLocation?.address || job.jobDetail?.detailedPosition?.workAddress
        break
      case '51job':
        extractedId = job.jobId || job.raw_detail_json?.detailJobInfo?.jobId
        extractedTitle = job.jobName || job.raw_detail_json?.detailJobInfo?.jobname
        extractedCompany = job.companyName || job.fullCompanyName || job.raw_detail_json?.detailJobInfo?.coName || job.raw_detail_json?.detailJobInfo?.companyName
        extractedSalary = job.provideSalaryString || job.raw_detail_json?.detailJobInfo?.provideSalaryString
        extractedLocation = job._detail_address || job.raw_detail_json?.detailJobInfo?.companyAddress || job.raw_detail_json?.detailJobInfo?.address
        break
      default:
        // 通用后备逻辑
        extractedId = job.jobId || job['职位ID']
        extractedTitle = job.title || job['职位名称']
        extractedCompany = job.companyName || job['公司名称']
        extractedSalary = job.salary || job['薪资待遇']
        extractedLocation = job.location || job['工作地点']
        break
    }

    // 仅针对智联招聘：v1 数据存入 rawData2，v2 及其他平台数据存入 rawData
    const isZhilianV1 = rawPlatform === '智联' && job.dataSource === 'zhilian_scraped_data_v1'
    // 仅针对猎聘：liepin_search_data 的数据存入 rawData2，liepin_home_data数据存入 rawData
    const isLiepinSearchData = rawPlatform === '猎聘' && job.dataSource === 'liepin_search_data'
    const stringifiedData = JSON.stringify(job)

    const updateData: any = {
      title: String(extractedTitle),
      companyName: String(extractedCompany),
      salary: String(extractedSalary),
      location: String(extractedLocation)
    }

    const createData: any = {
      jobId: String(extractedId),
      title: String(extractedTitle),
      companyName: String(extractedCompany),
      salary: String(extractedSalary),
      location: String(extractedLocation),
      platform: rawPlatform,
      dataSource: job.dataSource || 'unknown',
      createdAt: extractedCreatedAt,
      updatedAt: extractedUpdatedAt
    }

    if (isZhilianV1) {
      updateData.rawData2 = stringifiedData
      createData.rawData2 = stringifiedData
      createData.rawData = '{}' // Fallback for required field
    } else {
      updateData.rawData = stringifiedData
      createData.rawData = stringifiedData
    }

    if (isLiepinSearchData) {
      updateData.rawData2 = stringifiedData
      createData.rawData2 = stringifiedData
      createData.rawData = '{}' // Fallback for required field
    } else {
      updateData.rawData = stringifiedData
      createData.rawData = stringifiedData
    }

    await extractAndSaveCompany(job, rawPlatform)

    return prisma.job.upsert({
      where: {
        jobId_platform: {
          jobId: String(extractedId),
          platform: rawPlatform
        }
      },
      update: updateData,
      create: createData
    })
  })

  try {
    const results = await Promise.allSettled(upsertPromises)
    const successCount = results.filter(r => r.status === 'fulfilled').length
    const failures = results.filter(r => r.status === 'rejected')
    if (failures.length > 0) {
      console.error('Sync failures:', failures.map(f => f.reason))
    }

    return {
      success: true,
      message: `Successfully processed ${successCount} out of ${body.length} jobs.`
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})
