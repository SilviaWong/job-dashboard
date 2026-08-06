import prisma from './prisma'

/**
 * Extracts and upserts company information from a job payload.
 * 
 * @param job The normalized job object received by the API
 * @param platform The platform name (e.g., 'Boss直聘', '51job', etc.)
 */
export async function extractAndSaveCompany(job: any, platform: string) {
  let cName = ''
  let cFullName = ''
  let companyId = ''
  let rawData: any = {}

  // The normalized job usually stores the original frontend payload in '源数据' or 'rawData'
  // Or in sync-all, it's just the raw frontend payload directly.
  const rawJob = job['源数据'] || (typeof job.rawData === 'string' ? JSON.parse(job.rawData) : job.rawData) || job

  try {
    switch (platform) {
      case 'Boss直聘':
      case 'boss': {
        //boss直聘中，有两个字段（proxyJob/proxyType）可以标识是否为猎头/代招，判断的时候使用其中一个即可：
        // proxyJob=0表示企业直招，proxyJob=1表示猎头/代招
        // proxyType=0表示企业直招，proxyType!=0 表示猎头/代招（proxyType的值有很多种，目前比较确定的是proxyType=0表示企业直招，其他值不确定，暂时定为猎头/代招）
        if (rawJob?.proxyJob === 0) {
          cName = rawJob.brandName || rawJob.jobDetail?.zpData?.brandComInfo?.brandName || ''
          cFullName = rawJob.brandName || rawJob.jobDetail?.zpData?.brandComInfo?.brandName || ''
          companyId = rawJob.encryptBrandId || rawJob.jobDetail?.zpData?.brandComInfo?.encryptBrandId || ''
        } else {
          // 猎头/代招的职位数据，取职位发布的公司数据，不过公司id可能没有数据
          cName = rawJob.jobDetail?.zpData?.bossInfo?.brandName || ''
          cFullName = rawJob.jobDetail?.zpData?.bossInfo?.brandName || ''
          companyId = rawJob.encryptBrandId || rawJob.jobDetail?.zpData?.brandComInfo?.encryptBrandId || ''
        }

        rawData = {
          companyId: companyId,
          companyFullName: cFullName,
          companyName: cName,
          companyIndustry: rawJob.brandIndustry || rawJob.jobDetail?.zpData?.brandComInfo?.industryName || '',
          companyScale: rawJob.brandScaleName || rawJob.jobDetail?.zpData?.brandComInfo?.scaleName || '',
          sourcePlatform: 'Boss直聘'
        }
        break
      }

      case '51job': {
        // 51job extraction logic
        const coInfo = rawJob.coinfo || rawJob.companyInfo || rawJob.detailCompanyInfo || {}
        cName = coInfo.coname || rawJob.companyName || rawJob.raw_detail_json?.detailJobInfo?.coName || ''
        companyId = rawJob.encCoId || rawJob.raw_detail_json?.detailJobInfo?.pcdetailJobInfo?.encryCompanyId || coInfo.encryCompanyId || coInfo.coid || coInfo.ctmId || ''
        cFullName = rawJob.fullCompanyName || rawJob.raw_detail_json?.detailJobInfo?.companyName

        rawData = {
          ...coInfo,
          sourcePlatform: '51job'
        }
        break
      }

      case '猎聘':
      case 'liepin': {
        // Liepin extraction logic
        let name = ''
        const recruiterInfo = rawJob.jobDetailJson?.supplementalDomData?.recruiterInfo
        if (Array.isArray(recruiterInfo) && recruiterInfo.length > 0) {
          const lastItem = recruiterInfo[recruiterInfo.length - 1]
          if (typeof lastItem === 'string') {
            name = lastItem.replace(/^·\s*/, '').trim()
          }
        }
        const compInfo = rawJob.comp || {}
        const jobInfo = rawJob.job || {}
        if (jobInfo.jobKind === '1' || jobInfo.jobKind == 1) {
          cName = name
        } else {
          cName = compInfo.compName
        }
        companyId = compInfo.compId || ''
        cFullName = compInfo.fullCompanyName || name || ''

        rawData = {
          ...compInfo,
          sourcePlatform: '猎聘'
        }
        break
      }

      case '智联':
      case 'zhilian': {
        // Zhilian extraction logic
        const compInfo = rawJob.company || rawJob.companyInfo || rawJob.jobDetail?.detailedCompany || {}
        cName = rawJob.companyName || rawJob.jobDeliverCache?.companyName || compInfo.companyName || job.companyName || ''
        companyId = rawJob.companyNumber || rawJob.rootCompanyNumber || compInfo.companyNumber || ''
        cFullName = rawJob.companyName || rawJob.jobDeliverCache?.companyName || compInfo.companyName || ''

        rawData = {
          ...compInfo,
          sourcePlatform: '智联'
        }
        break
      }

      default:
        return
    }

    cName = String(cName).trim()
    let standardizedPlatform = String(platform)
    const lowerPlatform = standardizedPlatform.toLowerCase()
    if (lowerPlatform === 'liepin' || lowerPlatform === '猎聘') standardizedPlatform = '猎聘'
    else if (lowerPlatform === 'zhilian' || lowerPlatform === '智联') standardizedPlatform = '智联'
    else if (lowerPlatform === 'boss' || lowerPlatform === 'boss直聘') standardizedPlatform = 'Boss直聘'
    else if (lowerPlatform === '51job') standardizedPlatform = '51job'

    if (cName || companyId) {
      let existingCompany = null

      if (companyId) {
        existingCompany = await prisma.company.findFirst({
          where: { companyId: String(companyId), sourcePlatform: standardizedPlatform }
        })
      }

      if (!existingCompany && cName) {
        existingCompany = await prisma.company.findFirst({
          where: { companyName: cName, sourcePlatform: standardizedPlatform }
        })
      }

      const stringifiedData = JSON.stringify(rawData)
      const validCompanyId = companyId ? String(companyId) : undefined
      const validFullName = cFullName || undefined

      const updateData = {
        rawData: stringifiedData,
        companyId: validCompanyId || undefined,
        companyFullName: validFullName || undefined
      }

      if (existingCompany) {
        await prisma.company.update({
          where: { id: existingCompany.id },
          data: updateData
        })
      } else if (cName) {
        try {
          await prisma.company.create({
            data: {
              companyName: cName,
              companyFullName: validFullName,
              sourcePlatform: standardizedPlatform,
              companyId: validCompanyId,
              rawData: stringifiedData
            }
          })
        } catch (err: any) {
          // P2002 = Unique constraint failed
          if (err.code === 'P2002') {
            const newlyInserted = await prisma.company.findFirst({
              where: { companyName: cName, sourcePlatform: standardizedPlatform }
            })
            if (newlyInserted) {
              await prisma.company.update({
                where: { id: newlyInserted.id },
                data: updateData
              })
            }
          } else {
            throw err
          }
        }
      }
    }
  } catch (error) {
    console.error(`[CompanyExtractor] Failed to extract/upsert company for ${platform}:`, error)
  }
}
