import { getPrisma } from '#prisma'
import { getJobProcessor } from '../utils/jobExtractors'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const prisma = getPrisma(event)

  if (!Array.isArray(body)) {
    return { success: false, message: 'Invalid data format. Expected an array of jobs.' }
  }

  const results = []
  for (const job of body) {
    let rawPlatform = String(job.platform || job['平台'] || '未知')
    const lowerPlatform = rawPlatform.toLowerCase()
    if (lowerPlatform === 'liepin' || lowerPlatform === '猎聘') rawPlatform = '猎聘'
    else if (lowerPlatform === 'zhilian' || lowerPlatform === '智联') rawPlatform = '智联'
    else if (lowerPlatform === 'boss' || lowerPlatform === 'boss直聘') rawPlatform = 'Boss直聘'
    else if (lowerPlatform === '51job') rawPlatform = '51job'

    const parseDate = (dateStr?: string) => {
      if (!dateStr) return undefined
      const d = new Date(dateStr.replace(/-/g, '/'))
      return isNaN(d.getTime()) ? undefined : d
    }

    const processor = getJobProcessor(rawPlatform)
    
    try {
      const result = await processor(job, rawPlatform, prisma)
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

    const changedJobs = results
      .filter(r => r.status === 'fulfilled' && (r.value as any)?.changeDetail)
      .map(r => (r.value as any).changeDetail)

    return {
      success: true,
      message: changedJobs.length > 0
        ? `处理完成，检测到 ${changedJobs.length} 个岗位发生变更（薪资调整或JD修改）`
        : `Successfully processed ${successCount} out of ${body.length} jobs.`,
      changedJobs
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})
