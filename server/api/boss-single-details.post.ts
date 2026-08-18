import { getPrisma } from '#prisma'
import { JobStatus } from '../../utils/enums'

// 处理从boss直聘接收到的职位详情数据
export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  const body = await readBody(event)

  if (!Array.isArray(body)) {
    return { success: false, message: 'Invalid data format. Expected an array of boss single details.' }
  }

  const results = []

  for (const detail of body) {
    // 提取 jobId
    let jobId = detail['职位ID'] || ''

    if (!jobId) {
      console.warn('Cannot find jobId in boss single detail:', detail)
      continue
    }

    const jobTitle = detail['职位名称'] || ''
    const companyName = detail['公司名称'] || ''
    const companyFullName = detail['公司全称'] || ''
    const jobStatus = detail['招聘状态'] || ''
    
    // 如果从boss直聘职位详情页面抓取的数据中 职位名称、公司名称、公司全称都为空，说明职位可能已下架/关闭或页面失效
    const isInvalidPage = !companyFullName && !jobTitle && !companyName

    let stringifiedData = JSON.stringify(detail)
    const createdAt = new Date()
    const updatedAt = new Date()

    try {
      if (isInvalidPage) {
        // 对于无效页面，尝试保留原有的 rawData 并仅更新其招聘状态
        const existingDetail = await prisma.bossSingleDetail.findUnique({
          where: { jobId: String(jobId) }
        })

        if (existingDetail && existingDetail.rawData) {
          try {
            const parsedOldData = JSON.parse(existingDetail.rawData)
            parsedOldData['招聘状态'] = '职位已失效'
            stringifiedData = JSON.stringify(parsedOldData)
          } catch (e) {
            console.error('Failed to parse old rawData for jobId:', jobId)
            detail['招聘状态'] = '职位已失效'
            stringifiedData = JSON.stringify(detail)
          }
        } else {
          detail['招聘状态'] = '职位已失效'
          stringifiedData = JSON.stringify(detail)
        }
      }

      const result = await prisma.bossSingleDetail.upsert({
        where: {
          jobId: String(jobId)
        },
        update: {
          rawData: stringifiedData,
          updatedAt: updatedAt
        },
        create: {
          jobId: String(jobId),
          rawData: stringifiedData,
          createdAt: createdAt,
          updatedAt: updatedAt
        }
      })

      // 更新job表的companyFullName字段
      if (companyFullName) {
        await prisma.job.updateMany({
          where: { jobId: String(jobId), platform: 'Boss直聘' },
          data: {
            companyFullName: companyFullName,
            updatedAt: updatedAt
          }
        })
      }

      if (isInvalidPage || jobStatus === '职位已关闭' || jobStatus === '职位已失效') {
        await prisma.job.updateMany({
          where: { jobId: String(jobId), platform: 'Boss直聘' },
          data: {
            status: JobStatus.EXPIRED, // 正确更新状态为已失效枚举
            updatedAt: updatedAt
          }
        })
      }

      const companyId = detail['公司ID']
      // 如果公司ID不为空，则更新相关表中的公司全称字段
      if (companyId && companyFullName) {
        // 查询company表中的公司数据并更新
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

      results.push({ status: 'fulfilled', value: result })
    } catch (error) {
      results.push({ status: 'rejected', reason: error })
    }
  }

  try {
    const successCount = results.filter(r => r.status === 'fulfilled').length
    const failures = results.filter(r => r.status === 'rejected')

    if (failures.length > 0) {
      console.error('Sync failures:', failures.map(f => f.reason))
    }

    return {
      success: true,
      message: `Successfully processed ${successCount} out of ${body.length} boss single details.`
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})
