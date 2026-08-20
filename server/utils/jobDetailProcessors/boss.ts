import { getPrisma } from '#prisma'
import { JobStatus } from '../../../utils/enums'
import { cleanCompanyName } from '../companyProcessors/types'

/**
 * 处理并持久化从【Boss直聘】平台同步过来的职位详情数据
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
 *    - 如果包含有效的 `companyId` 与 `companyFullName`，同步更新 Company 表对应公司的企业全称。
 * 
 * @param detail 从 Boss直聘 详情页抓取的原始职位详情数据对象
 * @param rawPlatform 平台名称或标识（如 'boss' 或 'Boss直聘'）
 * @param prisma Prisma 数据库客户端实例
 */
export async function processBossJobDetail(detail: any, rawPlatform: string, prisma: ReturnType<typeof getPrisma>) {
  
  // =========================================================================
  // 第一步：提取并校验关键字段（jobId、职位名、公司全称、招聘状态等）
  // =========================================================================
  let jobId = detail['职位ID'] || ''

  if (!jobId) {
    console.warn('[Boss Job Detail Processor] 无法在详情数据中找到 jobId:', detail)
    return
  }

  const jobTitle = detail['职位名称'] || ''
  const companyName = cleanCompanyName(detail['公司名称'] || '')
  const companyFullName = cleanCompanyName(detail['公司全称'] || '')
  const jobStatus = detail['招聘状态'] || ''

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
          platform: 'Boss直聘'
        }
      }
    })

    if (existingDetail && existingDetail.rawData) {
      try {
        const parsedOldData = JSON.parse(existingDetail.rawData)
        parsedOldData['招聘状态'] = '职位已失效'
        stringifiedData = JSON.stringify(parsedOldData)
      } catch (e) {
        console.error('[Boss Job Detail Processor] 解析旧 rawData 失败, jobId:', jobId)
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
        platform: 'Boss直聘'
      }
    },
    update: {
      rawData: stringifiedData,
      updatedAt: updatedAt
    },
    create: {
      jobId: String(jobId),
      platform: 'Boss直聘',
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
      where: { jobId: String(jobId), platform: 'Boss直聘' },
      data: {
        companyFullName: companyFullName,
        updatedAt: updatedAt
      }
    })
  }

  // 4.2 若职位已关闭或失效，同步更新 Job 表状态为 EXPIRED (已失效)
  if (isInvalidPage || jobStatus === '职位已关闭' || jobStatus === '职位已失效') {
    await prisma.job.updateMany({
      where: { jobId: String(jobId), platform: 'Boss直聘' },
      data: {
        status: JobStatus.EXPIRED,
        updatedAt: updatedAt
      }
    })
  }

  // =========================================================================
  // 第五步：联动更新 Company 企业表中的企业全称
  // =========================================================================
  const companyId = detail['公司ID']
  if (companyId && companyFullName) {
    const companies = await prisma.company.findMany({
      where: { companyId: String(companyId), sourcePlatform: 'Boss直聘' }
    })

    for (const company of companies) {
      await prisma.company.update({
        where: { id: company.id },
        data: {
          companyFullName: companyFullName,
          updatedAt: updatedAt
        }
      })
    }
  }

  return result
}

