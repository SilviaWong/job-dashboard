import type { CompanyProcessor } from './types'

export const processDefaultCompany: CompanyProcessor = async (company, platform, prisma) => {
  let cName = company.companyName || company['公司名称'] || ''
  const cFullName = company.companyFullName || company['公司全称'] || cName
  const companyId = company.companyId || company['公司ID'] || ''
  const rawData = company.rawData || company

  cName = String(cName).trim()
  const standardizedPlatform = platform === 'boss' ? 'Boss直聘' : platform
  const finalCompanyName = cFullName || cName

  if (!finalCompanyName && !companyId) {
    return
  }

  let existingCompany = null

  if (companyId) {
    existingCompany = await prisma.company.findFirst({
      where: { companyId: String(companyId), sourcePlatform: standardizedPlatform }
    })
  }

  if (!existingCompany && finalCompanyName) {
    existingCompany = await prisma.company.findFirst({
      where: { companyName: finalCompanyName, sourcePlatform: standardizedPlatform }
    })
  }

  const stringifiedData = JSON.stringify(rawData)
  const validCompanyId = companyId ? String(companyId) : undefined
  const validFullName = cFullName || undefined

  if (existingCompany) {
    await prisma.company.update({
      where: { id: existingCompany.id },
      data: {
        rawData2: stringifiedData,
        companyId: validCompanyId || existingCompany.companyId,
        companyFullName: validFullName || existingCompany.companyFullName
      }
    })
  } else if (finalCompanyName) {
    try {
      await prisma.company.create({
        data: {
          companyName: finalCompanyName,
          companyFullName: validFullName,
          sourcePlatform: standardizedPlatform,
          companyId: validCompanyId,
          rawData2: stringifiedData
        }
      })
    } catch (createErr: any) {
      if (createErr.code === 'P2002') {
        const newlyCreated = await prisma.company.findFirst({
          where: { companyName: finalCompanyName, sourcePlatform: standardizedPlatform }
        })
        if (newlyCreated) {
          await prisma.company.update({
            where: { id: newlyCreated.id },
            data: {
              rawData2: stringifiedData,
              companyId: validCompanyId || newlyCreated.companyId,
              companyFullName: validFullName || newlyCreated.companyFullName
            }
          })
        }
      } else {
        throw createErr
      }
    }
  }
}
