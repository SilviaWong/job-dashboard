import prisma from '../utils/prisma'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!Array.isArray(body)) {
    return { success: false, message: 'Invalid data format. Expected an array of boss single details.' }
  }

  const upsertPromises = body.map(async (detail) => {
    // 提取 jobId
    let jobId = detail['职位ID'] || detail.encryptJobId || detail.jobId || detail.jobInfo?.encryptId || detail.zpData?.jobInfo?.encryptId

    if (!jobId) {
      console.warn('Cannot find jobId in boss single detail:', detail)
      return null
    }

    const stringifiedData = JSON.stringify(detail)

    const result = await prisma.bossSingleDetail.upsert({
      where: {
        jobId: String(jobId)
      },
      update: {
        rawData: stringifiedData
      },
      create: {
        jobId: String(jobId),
        rawData: stringifiedData
      }
    })

    const companyId = detail['公司ID']
    const companyFullName = detail['公司全称']

    // 如果公司ID不为空，则更新相关表中的公司全称字段
    if (companyId && companyFullName) {
      await prisma.job.updateMany({
        where: { jobId: String(jobId), platform: 'Boss直聘' },
        data: { companyFullName: companyFullName }
      })

      const companies = await prisma.company.findMany({
        where: { companyId: String(companyId), sourcePlatform: 'Boss直聘' }
      })

      for (const company of companies) {
        let updatedRawData = company.rawData
        if (updatedRawData) {
          try {
            const parsed = JSON.parse(updatedRawData)
            parsed.companyFullName = companyFullName
            updatedRawData = JSON.stringify(parsed)
          } catch (e) {
            console.error('Failed to parse company rawData for update:', e)
          }
        }

        await prisma.company.update({
          where: { id: company.id },
          data: {
            companyFullName: companyFullName,
            rawData: updatedRawData
          }
        })
      }
    }

    return result
  })

  try {
    const results = await Promise.allSettled(upsertPromises.filter(p => p !== null))
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
