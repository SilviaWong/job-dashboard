import { getPrisma } from '#prisma'
import { JobStatus } from '../../../utils/enums'
import { cleanCompanyName, upsertCompanyFromDetail } from '../companyProcessors/types'
import { cleanHtmlText } from '../jobNormalizer'

/**
 * 处理并持久化从【智联招聘】平台同步过来的职位详情数据
 * 
 * 核心逻辑与数据流设计：
 * 1. 提取并校验职位关键信息（jobId、职位名称、公司名称、公司全称、招聘状态等）；
 * 2. 异常页面与失效状态诊断：
 *    - 若职位名称和公司名称皆为空，判定为失效/下架页面；
 *    - 若属于失效页面，读取旧数据并更新状态为“职位已失效”，避免脏数据覆盖有效内容。
 * 3. 持久化至 JobDetail 表（upsert 操作）；
 * 4. 跨表双向联动更新：
 *    - 同步更新 Job 表的 `companyFullName`；
 *    - 职位失效/下架时（如状态为 4 或 '停止招聘'），同步更新 Job 表状态为 `JobStatus.EXPIRED`；
 *    - 若抓取到有效职位描述，同步清洗并写入 JobDetailPayload 冷数据表；
 * 5. 联动更新 Company 企业表中的企业全称。
 * 
 * @param detail 从智联招聘详情页抓取的原始职位详情数据对象
 * @param rawPlatform 平台名称或标识（如 'zhilian' 或 '智联'）
 * @param prisma Prisma 数据库客户端实例
 */
export async function processZhilianJobDetail(detail: any, rawPlatform: string, prisma: ReturnType<typeof getPrisma>) {

  // =========================================================================
  // 第一步：提取并校验关键字段（jobId、职位名、公司全称、招聘状态等）
  // =========================================================================
  const standardizedPlatform = (rawPlatform === 'zhilian' || rawPlatform === '智联招聘' || rawPlatform === '智联') ? '智联' : rawPlatform || '智联'
  const jobDetail = detail.jobDetail || {}
  const detailedPosition = jobDetail.detailedPosition || {}
  const compInfo = jobDetail.detailedCompany || {}

  let jobId = detail['职位ID'] || detail.jobId || detail.id || detail['job_id'] || detailedPosition.positionNumber || detailedPosition.number || ''

  if (!jobId) {
    console.warn(`[Zhilian Job Detail Processor] 无法在详情数据中找到 jobId (平台: ${standardizedPlatform}):`, detail)
    return
  }

  const jobTitle = detail['职位名称'] || detail.jobName || detailedPosition.name || detailedPosition.positionName || ''
  const companyName = cleanCompanyName(detail['公司名称'] || detail.companyName || compInfo.companyName || detailedPosition.companyName || detail['公司全称'] || '')
  const companyFullName = cleanCompanyName(detail['公司全称'] || detail.companyFullName || compInfo.companyName || detailedPosition.companyName || companyName || '')
  const jobStatusRaw = detail['招聘状态'] || detail.jobStatus || jobDetail.jobStatus || detailedPosition.jobStatus || detailedPosition.positionStatus || ''

  // 如果获取不到职位名称和公司名称，说明可能是失效/下架页面
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
        console.error('[Zhilian Job Detail Processor] 解析旧 rawData 失败, jobId:', jobId)
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
  // 4.1 同步更新 Job 表中的公司全称 companyFullName
  if (companyFullName) {
    await prisma.job.updateMany({
      where: { jobId: String(jobId), platform: standardizedPlatform },
      data: {
        companyFullName: companyFullName,
        updatedAt: updatedAt
      }
    })
  }

  // 4.2 若职位下架（jobStatusRaw 为 4 或 '停止招聘' 或 '职位已失效' 或 '职位已关闭' 或 '已下线'，或页面失效），同步更新 Job 表状态为 EXPIRED (已失效)
  if (
    isInvalidPage ||
    jobStatusRaw === 4 ||
    jobStatusRaw === '4' ||
    jobStatusRaw === '停止招聘' ||
    jobStatusRaw === '职位已失效' ||
    jobStatusRaw === '职位已关闭' ||
    jobStatusRaw === '已下线'
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
  const rawJobDesc = detail['职位描述'] || detail.jobDescribe || detailedPosition.description || detailedPosition.jobDesc || jobDetail.position?.desc?.description || ''
  if (rawJobDesc) {
    try {
      const targetJob = await prisma.job.findFirst({
        where: { jobId: String(jobId), platform: standardizedPlatform },
        select: { id: true }
      })
      if (targetJob) {
        const cleanDesc = cleanHtmlText(rawJobDesc)
        const jobUrl = detail['抓取源URL'] || detail['职位链接'] || detail.positionUrl || detailedPosition.positionUrl || detail.jobUrl || detail.url || ''
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
      console.error('[Zhilian Job Detail Processor] 同步更新 JobDetailPayload 异常:', e)
    }
  }

  // =========================================================================
  // 第五步：联动更新 Company 企业表（存储 rawData3 与补齐结构化字段）
  // =========================================================================
  const companyId = detail['公司ID'] || detail.companyId || detail.companyNumber || compInfo.companyNumber || detailedPosition.companyNumber || ''
  if (companyName || companyFullName || companyId) {
    try {
      await upsertCompanyFromDetail(prisma, {
        companyName: companyName,
        companyFullName: companyFullName,
        companyId: companyId ? String(companyId) : null,
        platform: standardizedPlatform,
        detailRaw: detail
      })
    } catch (e) {
      console.error('[Zhilian Job Detail Processor] 同步更新 Company 异常:', e)
    }
  }

  return result
}
