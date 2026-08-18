import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const prisma = getPrisma(event)

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { success: false, message: 'Invalid data format. Expected an object (Record<string, any>).' }
  }

  const zhilianCacheKeys = Object.keys(body)
  
  if (zhilianCacheKeys.length === 0) {
    return { success: true, message: 'No data to sync.' }
  }

  const results = []
  for (const jobId of zhilianCacheKeys) {
    const rawData = body[jobId]
    if (!rawData) continue

    try {
      const result = await prisma.zhilianEnrichmentCache.upsert({
        where: { jobId },
        update: { rawData: JSON.stringify(rawData) },
        create: { jobId, rawData: JSON.stringify(rawData) }
      })
      results.push({ status: 'fulfilled', value: result })
    } catch (err) {
      console.error('Failed to upsert ZhilianEnrichmentCache:', jobId, err)
      results.push({ status: 'rejected', reason: err })
    }
  }

  try {
    const successCount = results.filter(r => r.status === 'fulfilled').length
    const failures = results.filter(r => r.status === 'rejected')
    
    if (failures.length > 0) {
      console.error('Zhilian Cache Sync failures:', failures.map((f: any) => f.reason))
    }

    return {
      success: true,
      message: `Successfully processed ${successCount} out of ${zhilianCacheKeys.length} items.`
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})
