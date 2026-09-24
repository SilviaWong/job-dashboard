import { getPrisma } from '#prisma'
import { JobStatus } from '../../../utils/enums'
import { cleanCompanyName, upsertCompanyFromDetail } from '../companyProcessors/types'
import { cleanHtmlText } from '../jobNormalizer'

/**
 * 处理并持久化从【猎聘】平台同步过来的职位详情数据
 * 
 * 核心逻辑与数据流设计：
 * 1. 提取并校验职位关键信息（jobId、职位名称、公司名称、公司全称、招聘状态等）；
 * 2. 异常页面与失效状态诊断：
 *    - 若职位名称、公司名称、公司全称皆为空，判定为失效/下架页面；
 *    - 若属于失效页面，读取旧数据并更新状态为“职位已失效”，避免脏数据覆盖有效内容。
 * 3. 持久化至 JobDetail 表（upsert 操作）；
 * 4. 跨表双向联动更新：
 *    - 同步更新 Job 表的 `companyFullName`；
 *    - 职位失效/下架时，同步更新 Job 表状态为 `JobStatus.EXPIRED`；
 *    - 若抓取到有效职位描述，同步清洗并写入 JobDetailPayload 冷数据表；
 * 5. 联动更新 Company 企业表中的企业全称。
 * 
 * @param detail 从猎聘详情页抓取的原始职位详情数据对象
 * @param rawPlatform 平台名称或标识（如 'liepin' 或 '猎聘'）
 * @param prisma Prisma 数据库客户端实例
 */
export async function processLiepinJobDetail(detail: any, rawPlatform: string, prisma: ReturnType<typeof getPrisma>) {

  // =========================================================================
  // 第一步：提取并校验关键字段（jobId、职位名、公司全称、招聘状态等）
  // =========================================================================
  const standardizedPlatform = (rawPlatform === 'liepin' || rawPlatform === '猎聘') ? '猎聘' : rawPlatform || '猎聘'
  const jobInfo = detail.job || {}
  const compInfo = detail.comp || {}
  const jdJson = detail.jobDetailJson || detail.jobDetail || {}

  let jobId = detail['职位ID'] || detail.jobId || detail.id || detail['job_id'] || jobInfo.jobId || jdJson.identifier?.value || ''

  if (!jobId) {
    console.warn(`[Liepin Job Detail Processor] 无法在详情数据中找到 jobId (平台: ${standardizedPlatform}):`, detail)
    return
  }

  const jobTitle = detail['职位名称'] || detail.jobName || jobInfo.title || jdJson.title || ''
  
  // 猎聘网标识公司直招还是猎头/代招的字段：jobKind，1表示猎头/代招，2表示公司直招
  const isHeadhunter = String(jobInfo.jobKind) === '1' || String(detail.jobKind) === '1' || detail['岗位类型_外包猎头'] === '猎头/代招' || detail.isHeadhunter === true
  
  // 提取招聘人所属猎头公司名称
  let hrCoName = ''
  const recruiterInfo = jdJson.supplementalDomData?.recruiterInfo || []
  if (Array.isArray(recruiterInfo) && recruiterInfo.length > 0) {
    const lastItem = recruiterInfo[recruiterInfo.length - 1]
    if (typeof lastItem === 'string') {
      hrCoName = lastItem.replace(/^·\s*/, '').trim()
    }
  }
  const agencyName = cleanCompanyName(detail['HR所属公司'] || hrCoName || '')
  const rawClientName = cleanCompanyName(detail['公司全称'] || detail['公司名称'] || compInfo.fullCompanyName || compInfo.compFullName || compInfo.compName || compInfo.companyName || jdJson.hiringOrganization?.name || '')

  let companyName = ''
  let companyFullName = ''
  let clientCompanyName = ''

  if (isHeadhunter) {
    companyName = agencyName || rawClientName
    companyFullName = agencyName || rawClientName
    clientCompanyName = rawClientName
  } else {
    companyName = cleanCompanyName(detail['公司名称'] || detail.companyName || compInfo.compName || compInfo.companyName || jdJson.hiringOrganization?.name || '')
    companyFullName = cleanCompanyName(detail['公司全称'] || detail.companyFullName || compInfo.fullCompanyName || compInfo.compFullName || jdJson.hiringOrganization?.name || companyName || '')
  }

  const jobStatus = detail['招聘状态'] || detail.jobStatus || detail.status || (detail.isClosed ? '已下线' : '') || ''

  // 判断是否为异常/已下架页面：若职位名称、公司名称、公司全称均为空，说明页面已关闭或失效
  const isInvalidPage = !companyFullName && !jobTitle && !companyName

  let stringifiedData = JSON.stringify(detail)
  const createdAt = new Date()
  const updatedAt = new Date()

  // =========================================================================
  // 第二步：处理失效页面逻辑（保留原有详情内容，仅标记状态为失效）
  // =========================================================================
  if (isInvalidPage) {
    const existingDetail = await prisma.jobDetail.findUnique({
      where: {
        jobId_platform: {
          jobId: String(jobId),
          platform: standardizedPlatform
        }
      }
    })

    if (existingDetail && existingDetail.rawData) {
      try {
        const parsedOldData = JSON.parse(existingDetail.rawData)
        parsedOldData['招聘状态'] = '职位已失效'
        stringifiedData = JSON.stringify(parsedOldData)
      } catch (e) {
        console.error('[Liepin Job Detail Processor] 解析旧 rawData 失败, jobId:', jobId)
        detail['招聘状态'] = '职位已失效'
        stringifiedData = JSON.stringify(detail)
      }
    } else {
      detail['招聘状态'] = '职位已失效'
      stringifiedData = JSON.stringify(detail)
    }
  }

  // =========================================================================
  // 第三步：持久化至 JobDetail 表（upsert 写入）
  // =========================================================================
  const result = await prisma.jobDetail.upsert({
    where: {
      jobId_platform: {
        jobId: String(jobId),
        platform: standardizedPlatform
      }
    },
    update: {
      rawData: stringifiedData,
      updatedAt: updatedAt
    },
    create: {
      jobId: String(jobId),
      platform: standardizedPlatform,
      rawData: stringifiedData,
      createdAt: createdAt,
      updatedAt: updatedAt
    }
  })

  // =========================================================================
  // 第四步：联动更新 Job 职位表中的相关字段
  // =========================================================================
  // 4.1 同步更新 Job 表中的公司名、公司全称与代招客户公司
  const jobUpdateData: any = {
    updatedAt: updatedAt
  }

  if (isHeadhunter) {
    jobUpdateData.isHeadhunter = true
    if (agencyName) {
      jobUpdateData.companyName = agencyName
      jobUpdateData.companyFullName = agencyName
    }
    if (clientCompanyName) {
      jobUpdateData.clientCompanyName = clientCompanyName
    }
  } else {
    if (companyFullName) {
      jobUpdateData.companyFullName = companyFullName
    }
    if (companyName) {
      jobUpdateData.companyName = companyName
    }
  }

  await prisma.job.updateMany({
    where: { jobId: String(jobId), platform: standardizedPlatform },
    data: jobUpdateData
  })

  // 4.2 若职位已关闭或失效，同步更新 Job 表状态为 EXPIRED (已失效)
  if (
    isInvalidPage ||
    jobStatus === '职位已关闭' ||
    jobStatus === '职位已失效' ||
    jobStatus === '已下线' ||
    jobStatus === '已下架' ||
    jobStatus === '停止招聘'
  ) {
    await prisma.job.updateMany({
      where: { jobId: String(jobId), platform: standardizedPlatform },
      data: {
        status: JobStatus.EXPIRED,
        updatedAt: updatedAt
      }
    })
  }

  // 4.3 若抓取到有效职位描述，同步清洗并写入 JobDetailPayload 冷数据表
  const rawJobDesc = detail['职位描述'] || detail.description || jdJson.description || jdJson.supplementalDomData?.jobDescribe || ''
  if (rawJobDesc) {
    try {
      const targetJob = await prisma.job.findFirst({
        where: { jobId: String(jobId), platform: standardizedPlatform },
        select: { id: true }
      })
      if (targetJob) {
        const cleanDesc = cleanHtmlText(rawJobDesc)
        const jobUrl = detail['抓取源URL'] || detail['职位链接'] || detail.jobUrl || detail.link || jobInfo.link || jdJson.url || ''
        await prisma.jobDetailPayload.upsert({
          where: { jobRecordId: targetJob.id },
          update: {
            jobDesc: cleanDesc,
            rawData2: stringifiedData,
            ...(jobUrl ? { jobUrl } : {})
          },
          create: {
            jobRecordId: targetJob.id,
            jobDesc: cleanDesc,
            rawData2: stringifiedData,
            jobUrl: jobUrl || null
          }
        })
      }
    } catch (e) {
      console.error('[Liepin Job Detail Processor] 同步更新 JobDetailPayload 异常:', e)
    }
  }

  // =========================================================================
  // 第五步：联动更新 Company 企业表（存储 rawData3 与补齐结构化字段）
  // =========================================================================
  const targetCoName = isHeadhunter && agencyName ? agencyName : companyName
  const targetCoFullName = isHeadhunter && agencyName ? agencyName : companyFullName
  const companyId = !isHeadhunter ? (detail['公司ID'] || detail.companyId || detail.compId || compInfo.compId || compInfo.companyId || compInfo.link?.match(/\/company\/(\d+)/)?.[1] || jdJson.hiringOrganization?.sameAs?.match(/\/company\/(\d+)/)?.[1] || '') : ''

  if (targetCoName || targetCoFullName || companyId) {
    try {
      await upsertCompanyFromDetail(prisma, {
        companyName: targetCoName,
        companyFullName: targetCoFullName,
        companyId: companyId ? String(companyId) : null,
        platform: standardizedPlatform,
        detailRaw: detail.companyCard || detail
      })
    } catch (e) {
      console.error('[Liepin Job Detail Processor] 同步更新 Company 异常:', e)
    }
  }

  return result
}
