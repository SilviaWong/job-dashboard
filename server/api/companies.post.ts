import { getPrisma } from '../utils/prisma'
import { getCompanyProcessor } from '../utils/companyProcessors'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const prisma = getPrisma(event)

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

    try {
      const processor = getCompanyProcessor(rawPlatform)
      await processor(company, rawPlatform, prisma)
      results.push({ status: 'fulfilled' })
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
