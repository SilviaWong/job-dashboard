import { getPrisma } from '#prisma'

export async function processDefaultJobDetail(detail: any, rawPlatform: string, prisma: ReturnType<typeof getPrisma>) {
  // 提取 jobId，不同平台字段可能不同，做基础兼容
  let jobId = detail.jobId || detail['职位ID'] || detail['job_id'] || detail.id || ''

  if (!jobId) {
    console.warn(`Cannot find jobId in single detail for platform ${rawPlatform}:`, detail)
    return
  }

  const stringifiedData = JSON.stringify(detail)
  const createdAt = new Date()
  const updatedAt = new Date()

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
