import prisma from '../utils/prisma'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!Array.isArray(body)) {
    return { success: false, message: 'Invalid data format. Expected an array of companies.' }
  }

  const results: any[] = []

  for (const company of body) {
    let rawPlatform = String(company.platform || company['平台'] || '未知')
    const lowerPlatform = rawPlatform.toLowerCase()
    if (lowerPlatform === 'liepin' || lowerPlatform === '猎聘') rawPlatform = '猎聘'
    else if (lowerPlatform === 'zhilian' || lowerPlatform === '智联') rawPlatform = '智联'
    else if (lowerPlatform === 'boss' || lowerPlatform === 'boss直聘') rawPlatform = 'Boss直聘'
    else if (lowerPlatform === '51job') rawPlatform = '51job'

    let cName = ''
    let cFullName = ''
    let companyId = ''
    let rawData: any = company.rawData || company

    try {
      switch (rawPlatform) {
        case 'Boss直聘':
          cName = company['公司名称'] || company.brandName || company['公司全称'] || ''
          cFullName = company['公司全称'] || cName
          companyId = company['公司ID'] || company.encryptBrandId || ''
          break
        case '51job': {
          const coInfo = company.coinfo || company
          cName = coInfo.coname || company.license?.businessName || ''
          cFullName = coInfo.coname || company.license?.businessName || cName
          companyId = coInfo.encryCompanyId || coInfo.coid || coInfo.ctmId || ''
          break
        }
        case '猎聘':
          cName = company.compName || ''
          cFullName = company.fullCompanyName || cName
          companyId = company.compId || ''
          break
        case '智联':
          cName = company.companyName || company['公司名称'] || ''
          cFullName = company.companyName || company['公司全称'] || cName
          companyId = company.companyNumber || company.rootCompanyNumber || company['公司ID'] || ''
          break
        default:
          cName = company.companyName || company['公司名称'] || ''
          cFullName = company.companyFullName || company['公司全称'] || cName
          companyId = company.companyId || company['公司ID'] || ''
          break
      }
    } catch (e) {
      console.warn('Failed to parse company format', e)
    }

    cName = String(cName).trim()
    const standardizedPlatform = rawPlatform === 'boss' ? 'Boss直聘' : rawPlatform

    // Use full name as primary key if available, else short name
    const finalCompanyName = cFullName || cName

    if (!finalCompanyName && !companyId) {
      results.push({ status: 'fulfilled' })
      continue // Skip if no identifiers
    }

    let existingCompany = null

    try {
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
        results.push({ status: 'fulfilled' })
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
          // If a concurrent request just inserted this company, we catch the P2002 Unique Constraint error
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
        results.push({ status: 'fulfilled' })
      } else {
        results.push({ status: 'fulfilled' })
      }
    } catch (e) {
      results.push({ status: 'rejected', reason: e })
    }
  }

  try {
    const successCount = results.filter(r => r.status === 'fulfilled').length
    const failures = results.filter(r => r.status === 'rejected')
    if (failures.length > 0) {
      console.error('Company Sync failures:', failures.map((f: any) => f.reason))
    }

    return {
      success: true,
      message: `Successfully processed ${successCount} out of ${body.length} companies.`
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})
