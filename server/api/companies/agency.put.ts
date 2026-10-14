import { getPrisma } from '#prisma'

function isSourceDataHeadhunter(job: { platform: string; rawData: string }): boolean {
  if (!job.rawData) return false
  try {
    const raw = JSON.parse(job.rawData)
    if (job.platform === 'Boss直聘') {
      return raw.proxyJob === 1 || raw.zpData?.jobInfo?.proxyJob === 1 || !!(raw['岗位类型_外包猎头'] && String(raw['岗位类型_外包猎头']).includes('猎头'))
    }
    if (job.platform === '猎聘') {
      return String(raw.job?.jobKind) === '1' || String(raw.jobKind) === '1' || raw['岗位类型_外包猎头'] === '猎头/代招'
    }
    if (job.platform === '智联') {
      return (raw.proxyModel?.recruitPosition > 0) || (Number(raw.jobType) > 0)
    }
    if (job.platform === '51job') {
      return raw.jobType === '1' || raw.jobType === '2' || raw.companyTypeString === '中介'
    }
  } catch (e) {}
  return false
}

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  const body = await readBody(event)

  const { companyName, isAgency } = body

  if (!companyName) {
    return { success: false, error: 'companyName is required' }
  }

  const agencyFlag = Boolean(isAgency)

  try {
    // 查找是否存在该公司的记录
    const existingCompanies = await prisma.company.findMany({
      where: {
        OR: [
          { companyName: companyName },
          { companyFullName: companyName }
        ]
      }
    })

    if (existingCompanies.length > 0) {
      // 存在则更新所有匹配的记录
      const updateData: any = {
        isAgency: agencyFlag
      }
      if (agencyFlag) {
        updateData.industry = '人力资源服务'
      }
      await prisma.company.updateMany({
        where: {
          OR: [
            { companyName: companyName },
            { companyFullName: companyName }
          ]
        },
        data: updateData
      })
    } else {
      // 不存在则创建一条新的壳记录
      await prisma.company.create({
        data: {
          companyName: companyName,
          sourcePlatform: 'manual',
          isAgency: agencyFlag,
          industry: agencyFlag ? '人力资源服务' : undefined
        }
      })
    }

    // 级联同步职位（源数据为主，手动标记为补充）：
    if (agencyFlag) {
      // 补充生效：将该公司名下所有职位同步标记为代招职位
      await prisma.job.updateMany({
        where: {
          OR: [
            { companyName: companyName },
            { companyFullName: companyName }
          ]
        },
        data: {
          isHeadhunter: true
        }
      })
    } else {
      // 撤销手动标记：仅还原非源数据实锤的职位（保护源数据判定的真实代招职位）
      const jobs = await prisma.job.findMany({
        where: {
          OR: [
            { companyName: companyName },
            { companyFullName: companyName }
          ]
        },
        select: {
          id: true,
          platform: true,
          rawData: true
        }
      })

      const revertJobIds: string[] = []
      for (const j of jobs) {
        if (!isSourceDataHeadhunter(j)) {
          revertJobIds.push(j.id)
        }
      }

      if (revertJobIds.length > 0) {
        await prisma.job.updateMany({
          where: { id: { in: revertJobIds } },
          data: { isHeadhunter: false }
        })
      }
    }

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
