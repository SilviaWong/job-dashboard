import { getPrisma } from '#prisma'
import { JobStatus } from '../../../utils/enums'
import { cleanCompanyName } from '../companyProcessors/types'

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
 *    - 若职位下架（jobStatus 为 4 或 '停止招聘' 或页面失效），同步更新 Job 表状态为 `JobStatus.EXPIRED`。
 * 
 * @param detail 从智联招聘详情页抓取的原始职位详情数据对象
 * @param rawPlatform 平台名称或标识（如 'zhilian' 或 '智联招聘'）
 * @param prisma Prisma 数据库客户端实例
 */
export async function processZhilianJobDetail(detail: any, rawPlatform: string, prisma: ReturnType<typeof getPrisma>) {

  // =========================================================================
  // 第一步：提取并校验关键字段（jobId、职位名、公司全称、招聘状态等）
  // =========================================================================
  let jobId = detail.jobId || detail['职位ID'] || detail.id || detail['job_id'] || ''

  if (!jobId) {
    console.warn(`[Zhilian Job Detail Processor] 无法在详情数据中找到 jobId (平台: ${rawPlatform}):`, detail)
    return
  }

  const jobDetail = detail.jobDetail || {}
  const detailedPosition = jobDetail.detailedPosition || {}
  const compInfo = jobDetail.detailedCompany || {}

  const jobTitle = detailedPosition.name || detailedPosition.positionName || detail['职位名称'] || ''
  const companyName = cleanCompanyName(compInfo.companyName || detailedPosition.companyName || detail['公司名称'] || detail['公司全称'] || '')
  const companyFullName = cleanCompanyName(compInfo.companyName || detail['公司全称'] || '')

  // 如果获取不到职位名称和公司名称，说明可能是失效/下架页面
  const isInvalidPage = !jobTitle && !companyName

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
          platform: rawPlatform
        }
      }
    })

    if (existingDetail && existingDetail.rawData) {
      try {
        const parsedOldData = JSON.parse(existingDetail.rawData)
        parsedOldData['招聘状态'] = '职位已失效'
        stringifiedData = JSON.stringify(parsedOldData)
      } catch (e) {
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
        platform: rawPlatform
      }
    },
    update: {
      rawData: stringifiedData,
      updatedAt: updatedAt
    },
    create: {
      jobId: String(jobId),
      platform: rawPlatform,
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
      where: { jobId: String(jobId), platform: rawPlatform },
      data: {
        companyFullName: companyFullName,
        updatedAt: updatedAt
      }
    })
  }

  // 4.2 若职位下架（jobStatusRaw 为 4 或 '停止招聘'，或页面失效），同步更新 Job 表状态为 EXPIRED (已失效)
  const jobStatusRaw = detail.jobStatus || jobDetail.jobStatus || jobDetail.positionStatus
  if (isInvalidPage || jobStatusRaw === 4 || jobStatusRaw === '停止招聘') {
    await prisma.job.updateMany({
      where: { jobId: String(jobId), platform: rawPlatform },
      data: {
        status: JobStatus.EXPIRED,
        updatedAt: updatedAt
      }
    })
  }

  return result
}

