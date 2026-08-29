import { getPrisma } from '#prisma'
import { parseChatTextLines, cleanCompanyNameForBlacklist } from '../../utils/blacklistParser'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)

  try {
    const body = await readBody(event)
    let companiesToAdd: Array<{ companyName: string; reason?: string; source?: string }> = []

    if (body.rawText && typeof body.rawText === 'string') {
      const parsed = parseChatTextLines(body.rawText)
      companiesToAdd = parsed.map(p => ({
        companyName: p.companyName,
        reason: p.reason,
        source: 'chat_rejection'
      }))
    } else if (Array.isArray(body.companies)) {
      companiesToAdd = body.companies
    } else if (body.companyName) {
      companiesToAdd = [{
        companyName: body.companyName,
        reason: body.reason,
        source: body.source || 'manual'
      }]
    }

    if (!companiesToAdd || companiesToAdd.length === 0) {
      return {
        success: false,
        error: '未提供有效的企业黑名单数据'
      }
    }

    let addedCount = 0
    let updatedCount = 0
    const processedNames: string[] = []

    for (const item of companiesToAdd) {
      const cleanName = cleanCompanyNameForBlacklist(item.companyName)
      if (!cleanName || cleanName.length < 2) continue

      const reason = item.reason || '人工拉黑'
      const source = item.source || 'manual'

      const existing = await prisma.blacklistedCompany.findUnique({
        where: { companyName: cleanName }
      })

      if (existing) {
        await prisma.blacklistedCompany.update({
          where: { companyName: cleanName },
          data: {
            reason,
            source,
            updatedAt: new Date()
          }
        })
        updatedCount++
      } else {
        await prisma.blacklistedCompany.create({
          data: {
            companyName: cleanName,
            reason,
            source
          }
        })
        addedCount++
      }
      processedNames.push(cleanName)
    }

    return {
      success: true,
      message: `成功处理 ${processedNames.length} 家企业 (新增 ${addedCount} 家, 更新 ${updatedCount} 家)`,
      data: {
        addedCount,
        updatedCount,
        processedCompanies: processedNames
      }
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    }
  }
})
