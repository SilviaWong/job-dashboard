import type { CompanyProcessor } from './types'

// 解析从 51job 同步过来的公司数据 51job_companies_scraped
export const process51JobCompany: CompanyProcessor = async (company, platform, prisma) => {
  const coInfo = company.coinfo || company

  let cName = coInfo.coname || company.license?.businessName || ''
  let cFullName = coInfo.coname || company.license?.businessName || ''
  const companyId = coInfo.encryCompanyId || ''

  cName = String(cName).trim()
  cFullName = String(cFullName).trim()

  const stringifiedData = JSON.stringify(coInfo)
  const createdAt = new Date()
  const updatedAt = new Date()

  if (!cName && !companyId) {
    return
  }

  let existingCompany = null

  if (companyId) {
    existingCompany = await prisma.company.findFirst({
      where: { companyId: String(companyId), sourcePlatform: platform }
    })
  }

  if (!existingCompany && cName) {
    existingCompany = await prisma.company.findFirst({
      where: { companyName: cName, sourcePlatform: platform }
    })
  }

  // 从公司接口接收到的json数据放到 company 表的 rawData2 字段
  if (existingCompany) {
    await prisma.company.update({
      where: { id: existingCompany.id },
      data: {
        rawData2: stringifiedData,
        companyId: companyId || existingCompany.companyId,
        companyFullName: cFullName || existingCompany.companyFullName,
        updatedAt: updatedAt
      }
    })
  } else if (cName) {
    try {
      await prisma.company.create({
        data: {
          companyName: cName,
          companyFullName: cFullName,
          sourcePlatform: platform,
          companyId: companyId,
          createdAt: createdAt,
          updatedAt: updatedAt,
          rawData2: stringifiedData
        }
      })
    } catch (createErr: any) {
      if (createErr.code === 'P2002') {
        const newlyCreated = await prisma.company.findFirst({
          where: { companyName: cName, sourcePlatform: platform }
        })
        if (newlyCreated) {
          await prisma.company.update({
            where: { id: newlyCreated.id },
            data: {
              rawData2: stringifiedData,
              companyId: companyId || newlyCreated.companyId,
              companyFullName: cFullName || newlyCreated.companyFullName,
              updatedAt: updatedAt
            }
          })
        }
      } else {
        throw createErr
      }
    }
  }
}
