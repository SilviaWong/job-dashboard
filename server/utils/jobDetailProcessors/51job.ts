import { getPrisma } from '#prisma'
import { JobStatus } from '../../../utils/enums'
import { cleanCompanyName } from '../companyProcessors/types'
import { cleanHtmlText } from '../jobNormalizer'

/**
 * 处理并持久化从【前程无忧 51job】平台同步过来的职位详情数据
 * 
 * 核心逻辑与数据流设计：
 * 1. 提取并校验职位关键信息（jobId、职位名称、公司名称、公司全称、招聘状态等）；
 *    - 兼容扁平顶层字段与 raw_detail_json (detailJobInfo, pcdetailJobInfo, jobHrInfo) 结构；
 *    - 提取 51job 特有的加密企业编号 encryCompanyId 与数字 coId。
 * 2. 异常页面与失效状态诊断：
 *    - 若职位名称、公司名称、公司全称皆为空，判定为失效/下架页面；
 *    - 若属于失效页面，读取旧数据并更新状态为“职位已失效”，避免脏数据覆盖有效内容。
 * 3. 持久化至 JobDetail 表（upsert 操作）；
 * 4. 跨表双向联动更新：
 *    - 同步更新 Job 表的 `companyFullName` 以及 `companyId` (以 encryCompanyId 为准)；
 *    - 职位失效/下架时，同步更新 Job 表状态为 `JobStatus.EXPIRED`；
 *    - 若抓取到有效职位描述，同步清洗并写入 JobDetailPayload 冷数据表；
 * 5. 联动更新 Company 企业表中的企业全称：
 *    - 优先采用 encryCompanyId 精确匹配，支持数字 ID 与企业简称/全称多路 OR 兜底。
 * 
 * @param detail 从 51job 详情页抓取的原始职位详情数据对象
 * @param rawPlatform 平台名称或标识（如 '51job' 或 '前程无忧'）
 * @param prisma Prisma 数据库客户端实例
 */
export async function process51JobDetail(detail: any, rawPlatform: string, prisma: ReturnType<typeof getPrisma>) {
  
  // =========================================================================
  // 第一步：提取并校验关键字段（jobId、职位名、公司全称、招聘状态等）
  // =========================================================================
  const standardizedPlatform = (rawPlatform === '51job' || rawPlatform === '前程无忧') ? '51job' : rawPlatform || '51job'
  const rawDetail = detail.raw_detail_json || {}
  const detailJobInfo = detail.detailJobInfo || rawDetail.detailJobInfo || {}
  const pcInfo = detail.pcdetailJobInfo || rawDetail.pcdetailJobInfo || {}
  const coInfo = detail.coinfo || rawDetail.coinfo || {}
  const license = detail.license || rawDetail.license || {}

  let jobId = detail['职位ID'] || detail.jobId || detail.id || detail['job_id'] || detailJobInfo.jobId || ''

  if (!jobId) {
    console.warn(`[51Job Detail Processor] 无法在详情数据中找到 jobId (平台: ${standardizedPlatform}):`, detail)
    return
  }

  const jobTitle = detail['职位名称'] || detail.jobName || detailJobInfo.jobName || ''
  const companyName = cleanCompanyName(detail['公司名称'] || detail.companyName || detailJobInfo.companyName || detailJobInfo.coName || coInfo.coname || '')
  const companyFullName = cleanCompanyName(detail['公司全称'] || detail.companyFullName || license.businessName || coInfo.coname || detailJobInfo.companyName || companyName || '')
  const jobStatus = detail['招聘状态'] || detail.jobStatus || (detailJobInfo.term === '1' || detailJobInfo.term === 1 ? '职位已下架' : '') || ''

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
        console.error('[51Job Detail Processor] 解析旧 rawData 失败, jobId:', jobId)
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
  // 提取 51job 核心加密企业 ID (encryCompanyId)，该 ID 与 Job 表和 Company 表的主键保持一致
  const encryCompanyId = detail.encryCompanyId || pcInfo.encryCompanyId || detail.encCoId || ''
  const numericCompanyId = detail['公司ID'] || detail.companyId || detailJobInfo.coId || coInfo.coid || ''

  // 4.1 同步更新 Job 表中的公司全称 companyFullName 以及 companyId
  const jobUpdateData: any = {
    updatedAt: updatedAt
  }
  if (companyFullName) jobUpdateData.companyFullName = companyFullName
  if (encryCompanyId) jobUpdateData.companyId = String(encryCompanyId)

  await prisma.job.updateMany({
    where: { jobId: String(jobId), platform: standardizedPlatform },
    data: jobUpdateData
  })

  // 4.2 若职位已关闭或失效，同步更新 Job 表状态为 EXPIRED (已失效)
  if (
    isInvalidPage ||
    jobStatus === '职位已关闭' ||
    jobStatus === '职位已失效' ||
    jobStatus === '职位已下线' ||
    jobStatus === '暂停招聘' ||
    jobStatus === '职位已下架'
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
  const rawJobDesc = detail['职位描述'] || detail.jobDescribe || detailJobInfo.jobDescribe || ''
  if (rawJobDesc) {
    try {
      const targetJob = await prisma.job.findFirst({
        where: { jobId: String(jobId), platform: standardizedPlatform },
        select: { id: true }
      })
      if (targetJob) {
        const cleanDesc = cleanHtmlText(rawJobDesc)
        const jobUrl = detail['抓取源URL'] || detail.jobHref || detail.jobUrl || detailJobInfo.jobHref || ''
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
      console.error('[51Job Detail Processor] 同步更新 JobDetailPayload 异常:', e)
    }
  }

  // =========================================================================
  // 第五步：联动更新 Company 企业表中的企业全称
  // =========================================================================
  if (companyFullName) {
    const orConditions: any[] = []
    // 51job Company 表中的 companyId 统一存的是 encryCompanyId (如 AWRUN146BT4CYAdmUTE)
    if (encryCompanyId) {
      orConditions.push({ companyId: String(encryCompanyId) })
    }
    if (numericCompanyId) {
      orConditions.push({ companyId: String(numericCompanyId) })
    }
    if (companyName) {
      orConditions.push({ companyName: companyName })
    }
    if (detailJobInfo.coName) {
      const cleanedCoName = cleanCompanyName(detailJobInfo.coName)
      if (cleanedCoName && cleanedCoName !== companyName) {
        orConditions.push({ companyName: cleanedCoName })
      }
    }

    if (orConditions.length > 0) {
      const companies = await prisma.company.findMany({
        where: {
          sourcePlatform: standardizedPlatform,
          OR: orConditions
        }
      })

      for (const company of companies) {
        await prisma.company.update({
          where: { id: company.id },
          data: {
            companyFullName: companyFullName,
            ...(encryCompanyId && (!company.companyId || company.companyId === String(numericCompanyId)) ? { companyId: String(encryCompanyId) } : {}),
            updatedAt: updatedAt
          }
        })
      }
    }
  }

  return result
}
