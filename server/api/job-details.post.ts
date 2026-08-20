import { getPrisma } from '#prisma'
import { getJobDetailProcessor } from '../utils/jobDetailProcessors'

// 统一处理从各个平台接收到的职位详情数据
export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  const body = await readBody(event)

  if (!Array.isArray(body)) {
    return { success: false, message: 'Invalid data format. Expected an array of job details.' }
  }

  const results = []

  for (const detail of body) {
    // 尝试获取 platform 字段，若不存在且包含特定字段默认推测为 Boss 直聘
    let rawPlatform = String(detail.platform || detail['平台'] || '')
    
    if (!rawPlatform) {
      if (detail['职位ID'] && detail['职位名称'] && detail['公司名称']) {
        rawPlatform = 'Boss直聘'
      } else {
        rawPlatform = '未知'
      }
    }

    const lowerPlatform = rawPlatform.toLowerCase()
    if (lowerPlatform === 'liepin' || lowerPlatform === '猎聘') rawPlatform = '猎聘'
    else if (lowerPlatform === 'zhilian' || lowerPlatform === '智联') rawPlatform = '智联'
    else if (lowerPlatform === 'boss' || lowerPlatform === 'boss直聘') rawPlatform = 'Boss直聘'
    else if (lowerPlatform === '51job') rawPlatform = '51job'

    const processor = getJobDetailProcessor(rawPlatform)
    
    try {
      const result = await processor(detail, rawPlatform, prisma)
      results.push({ status: 'fulfilled', value: result })
    } catch (error) {
      results.push({ status: 'rejected', reason: error })
    }
  }

  try {
    const successCount = results.filter(r => r.status === 'fulfilled').length
    const failures = results.filter(r => r.status === 'rejected')

    if (failures.length > 0) {
      console.error('Job Detail Sync failures:', failures.map(f => f.reason))
    }

    return {
      success: true,
      message: `Successfully processed ${successCount} out of ${body.length} job details.`
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})
