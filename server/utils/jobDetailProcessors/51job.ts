import { getPrisma } from '#prisma'

/**
 * 处理并持久化从【前程无忧 51job】平台同步过来的职位详情数据
 * 
 * 核心逻辑：
 * 1. 提取并校验唯一的职位标识符 `jobId`；
 * 2. 将抓取到的全量职位详情 JSON 对象持久化保存到 `JobDetail` 表的 `rawData` 字段中；
 * 3. 采用 `upsert` 操作，若已存在相同 `(jobId, platform)` 则更新，否则创建新记录。
 * 
 * @param detail 从 51job 详情页抓取的原始职位详情数据对象
 * @param rawPlatform 平台名称或标识（如 '51job' 或 '前程无忧'）
 * @param prisma Prisma 数据库客户端实例
 */
export async function process51JobDetail(detail: any, rawPlatform: string, prisma: ReturnType<typeof getPrisma>) {
  
  // =========================================================================
  // 第一步：提取并校验 jobId
  // =========================================================================
  let jobId = detail.jobId || detail['职位ID'] || detail.id || detail['job_id'] || ''

  if (!jobId) {
    console.warn(`[51Job Detail Processor] 无法在详情数据中找到 jobId (平台: ${rawPlatform}):`, detail)
    return
  }

  const stringifiedData = JSON.stringify(detail)
  const createdAt = new Date()
  const updatedAt = new Date()

  // =========================================================================
  // 第二步：持久化到 JobDetail 表（执行 upsert 写入）
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

  return result
}

